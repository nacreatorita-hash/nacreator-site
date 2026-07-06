'use strict';

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'posts');
const TEMPLATE_PATH = path.join(ROOT, 'article-template.html');
const ARTICLES_PATH = path.join(ROOT, 'articoli.html');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const SITE_URL = 'https://nacreator.it';

const VALID_TYPES = new Set([
  'text',
  'title-text',
  'text-image-right',
  'image-left-text',
  'full-image',
  'bullet-list',
  'benefits-grid',
  'quote',
  'highlight',
  'cta',
  'youtube',
  'faq'
]);

const REQUIRED = [
  'title',
  'slug',
  'description',
  'category',
  'date',
  'author',
  'status',
  'heroImage',
  'heroImageAlt',
  'lead',
  'output'
];

const ALLOWED_STATUSES = new Set([
  'draft',
  'published',
  'scheduled'
]);

const isValidateOnly = process.argv.includes('--validate');

const cleanText = (value = '') =>
  String(value).replace(/<[^>]*>/g, '').trim();

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

const slugify = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const safeJson = (value) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

const safeUrl = (value, allowMailto = false) => {
  if (!value) return '';

  const raw = String(value).trim();

  if (/^(javascript|data|vbscript):/i.test(raw)) {
    return '';
  }

  if (allowMailto && /^mailto:/i.test(raw)) {
    return raw;
  }

  if (/^(https?:\/\/|#|[./]?[a-z0-9_-])/i.test(raw)) {
    return raw;
  }

  return '';
};

const renderMarkdown = (value = '') =>
  sanitizeHtml(marked.parse(String(value)), {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      'a',
      'h2',
      'h3',
      'ul',
      'ol',
      'li',
      'blockquote',
      'code'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel']
    },
    allowedSchemes: [
      'http',
      'https',
      'mailto'
    ],
    transformTags: {
      a: (_tag, attrs) => ({
        tagName: 'a',
        attribs: {
          ...attrs,
          href: safeUrl(attrs.href, true),
          ...(attrs.target === '_blank'
            ? { rel: 'noopener noreferrer' }
            : {})
        }
      })
    }
  });

function fail(message, file = '') {
  throw new Error(`${file ? `${file}: ` : ''}${message}`);
}

function assertLocalPath(relativePath, label) {
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.includes('..') ||
    relativePath.includes('\\')
  ) {
    fail(`${label} contiene un percorso non valido`);
  }

  const resolved = path.resolve(ROOT, relativePath);

  if (!resolved.startsWith(`${ROOT}${path.sep}`)) {
    fail(`${label} esce dalla cartella del sito`);
  }

  return resolved;
}

function preferredImage(relativePath) {
  if (!relativePath || /\.webp$/i.test(relativePath)) {
    return relativePath;
  }

  const candidate = relativePath.replace(
    /\.(png|jpe?g)$/i,
    '.webp'
  );

  return candidate !== relativePath &&
    fs.existsSync(path.join(ROOT, candidate))
    ? candidate
    : relativePath;
}

function normalizeSections(raw, file) {
  let sections = raw;

  if (typeof raw === 'string') {
    try {
      sections = JSON.parse(raw);
    } catch (error) {
      fail(
        `sectionsJson non è JSON valido (${error.message})`,
        file
      );
    }
  }

  if (!Array.isArray(sections)) {
    fail('sectionsJson deve contenere un array', file);
  }

  const ids = new Set();

  return sections.map((section, index) => {
    if (!section || typeof section !== 'object') {
      fail(`sezione ${index + 1} non valida`, file);
    }

    if (!VALID_TYPES.has(section.type)) {
      fail(
        `tipo di sezione non supportato: ${section.type}`,
        file
      );
    }

    const id = slugify(
      section.id || `section-${index + 1}`
    );

    if (!id || ids.has(id)) {
      fail(
        `ID sezione duplicato o non valido: ${section.id}`,
        file
      );
    }

    ids.add(id);

    return {
      ...section,
      id,
      enabled: section.enabled !== false
    };
  });
}

function validatePost(data, file) {
  REQUIRED.forEach((field) => {
    if (
      !data[field] ||
      !String(data[field]).trim()
    ) {
      fail(
        `campo obbligatorio mancante: ${field}`,
        file
      );
    }
  });

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) {
    fail('slug non valido', file);
  }

  if (!/^articolo-[a-z0-9-]+\.html$/.test(data.output)) {
    fail('output non valido', file);
  }

  if (!ALLOWED_STATUSES.has(data.status)) {
    fail(`stato non valido: ${data.status}`, file);
  }

  if (
    Number.isNaN(
      Date.parse(`${data.date}T00:00:00Z`)
    )
  ) {
    fail('data non valida', file);
  }

  const hero = assertLocalPath(
    data.heroImage,
    'heroImage'
  );

  if (!fs.existsSync(hero)) {
    fail(
      `immagine hero mancante: ${data.heroImage}`,
      file
    );
  }

  data.sections.forEach((section) => {
    if (section.image) {
      const image = assertLocalPath(
        section.image,
        `immagine sezione ${section.id}`
      );

      if (!fs.existsSync(image)) {
        fail(
          `immagine mancante: ${section.image}`,
          file
        );
      }

      if (!cleanText(section.imageAlt)) {
        fail(
          `testo alternativo mancante nella sezione ${section.id}`,
          file
        );
      }
    }

    if (
      section.type === 'youtube' &&
      !/^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]+$/.test(
        section.url || ''
      )
    ) {
      fail(
        `URL YouTube non consentito nella sezione ${section.id}`,
        file
      );
    }
  });
}

function loadPosts() {
  if (!fs.existsSync(POSTS_DIR)) {
    fail('cartella posts/ mancante');
  }

  const seenSlugs = new Set();
  const seenOutputs = new Set();

  return fs
    .readdirSync(POSTS_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const fullPath = path.join(
        POSTS_DIR,
        name
      );

      const parsed = matter.read(fullPath);

      const data = {
        ...parsed.data,
        sourceFile: name
      };

      data.sections = normalizeSections(
        data.sectionsJson || data.sections,
        name
      ).map((section) =>
        section.image
          ? {
              ...section,
              image: preferredImage(section.image)
            }
          : section
      );

      data.heroImage = preferredImage(
        data.heroImage
      );

      data.keywords = Array.isArray(data.keywords)
        ? data.keywords
        : String(data.keywords || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);

      data.readingTime =
        data.readingTime ||
        `${
          Math.max(
            1,
            Math.ceil(
              cleanText(
                data.sections
                  .map(
                    (section) =>
                      section.content || ''
                  )
                  .join(' ')
              )
                .split(/\s+/)
                .filter(Boolean).length / 200
            )
          )
        } minuti di lettura`;

      validatePost(data, name);

      if (seenSlugs.has(data.slug)) {
        fail(
          `slug duplicato: ${data.slug}`,
          name
        );
      }

      if (seenOutputs.has(data.output)) {
        fail(
          `URL duplicato: ${data.output}`,
          name
        );
      }

      seenSlugs.add(data.slug);
      seenOutputs.add(data.output);

      return data;
    })
    .sort((a, b) =>
      String(b.date).localeCompare(
        String(a.date)
      )
    );
}

function imageMarkup(
  section,
  className = 'article-media'
) {
  const ratio =
    /^\d+\s*\/\s*\d+$/.test(
      section.aspectRatio || ''
    )
      ? section.aspectRatio.replace(/\s/g, '')
      : '16/10';

  const link = safeUrl(section.link);

  const image = `
    <img
      src="${escapeHtml(section.image)}"
      alt="${escapeHtml(section.imageAlt)}"
      width="${Number(section.width) || 1400}"
      height="${Number(section.height) || 875}"
      loading="lazy"
    >
  `;

  return `
    <figure
      class="${className}"
      style="--media-ratio:${escapeHtml(ratio)}"
    >
      ${
        link
          ? `<a href="${escapeHtml(link)}">${image}</a>`
          : image
      }
      ${
        section.caption
          ? `<figcaption>${escapeHtml(section.caption)}</figcaption>`
          : ''
      }
    </figure>
  `;
}

function heading(section, headingIds) {
  if (!section.title) {
    return '';
  }

  let base =
    slugify(section.title) || section.id;

  let id = base;
  let count = 2;

  while (headingIds.has(id)) {
    id = `${base}-${count++}`;
  }

  headingIds.add(id);
  section.headingId = id;

  return `
    <h2 id="${id}">
      ${escapeHtml(section.title)}
    </h2>
  `;
}

function renderSection(section, headingIds) {
  if (!section.enabled) {
    return '';
  }

  const title = heading(
    section,
    headingIds
  );

  const content = renderMarkdown(
    section.content || ''
  );

  switch (section.type) {
    case 'text':
      return `
        <section
          class="article-section reveal"
          id="${section.id}"
        >
          ${content}
        </section>
      `;

    case 'title-text':
      return `
        <section
          class="article-section reveal"
          id="${section.id}"
        >
          ${title}
          ${content}
        </section>
      `;

    case 'text-image-right':
      return `
        <section
          class="article-section article-split article-split--image-right reveal"
          id="${section.id}"
        >
          <div class="article-copy">
            ${title}
            ${content}
          </div>
          ${imageMarkup(section)}
        </section>
      `;

    case 'image-left-text':
      return `
        <section
          class="article-section article-split article-split--image-left reveal"
          id="${section.id}"
        >
          ${imageMarkup(section)}
          <div class="article-copy">
            ${title}
            ${content}
          </div>
        </section>
      `;

    case 'full-image':
      return `
        <section
          class="article-section full-image reveal"
          id="${section.id}"
        >
          ${title}
          ${imageMarkup(
            section,
            'article-media'
          )}
        </section>
      `;

    case 'bullet-list':
      return `
        <section
          class="article-section reveal"
          id="${section.id}"
        >
          ${title}
          ${content}
          <ul>
            ${
              (section.items || [])
                .map(
                  (item) =>
                    `<li>${escapeHtml(item)}</li>`
                )
                .join('')
            }
          </ul>
        </section>
      `;

    case 'benefits-grid':
      return `
        <section
          class="article-section reveal"
          id="${section.id}"
        >
          ${title}
          ${content}
          <div class="benefits-grid">
            ${
              (section.items || [])
                .map(
                  (item) => `
                    <article class="benefit-card">
                      <h3>${escapeHtml(item.title)}</h3>
                      <p>${escapeHtml(item.text)}</p>
                    </article>
                  `
                )
                .join('')
            }
          </div>
        </section>
      `;

    case 'quote':
      return `
        <blockquote
          class="article-section quote reveal"
          id="${section.id}"
        >
          ${content}
          ${
            section.author
              ? `<cite>${escapeHtml(section.author)}</cite>`
              : ''
          }
        </blockquote>
      `;

    case 'highlight':
      return `
        <aside
          class="article-section highlight reveal"
          id="${section.id}"
        >
          ${title}
          ${content}
        </aside>
      `;

    case 'cta': {
      const url =
        safeUrl(section.url, true) ||
        'mailto:info@nacreator.it';

      return `
        <section
          class="article-section cta-panel reveal"
          id="${section.id}"
        >
          ${title}
          ${content}
          <a
            class="btn btn-primary"
            href="${escapeHtml(url)}"
          >
            ${escapeHtml(
              section.buttonText ||
              'Contattaci'
            )}
          </a>
        </section>
      `;
    }

    case 'youtube':
      return `
        <section
          class="article-section reveal"
          id="${section.id}"
        >
          ${title}
          ${content}
          <div class="video-frame">
            <iframe
              src="${escapeHtml(section.url)}"
              title="${escapeHtml(
                section.videoTitle ||
                section.title ||
                'Video YouTube'
              )}"
              loading="lazy"
              allowfullscreen
            ></iframe>
          </div>
        </section>
      `;

    case 'faq':
      return `
        <section
          class="article-section reveal"
          id="${section.id}"
        >
          ${title}
          <div class="faq-list">
            ${
              (section.items || [])
                .map(
                  (item) => `
                    <details class="faq-item">
                      <summary>
                        ${escapeHtml(item.question)}
                      </summary>
                      ${renderMarkdown(item.answer)}
                    </details>
                  `
                )
                .join('')
            }
          </div>
        </section>
      `;

    default:
      fail(
        `Tipo di sezione non supportato: ${section.type}`
      );
  }
}

function formatDate(value) {
  return new Intl.DateTimeFormat(
    'it-IT',
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }
  ).format(
    new Date(`${value}T00:00:00Z`)
  );
}

function relatedFor(post, published) {
  const words = new Set(
    post.keywords.map(
      (word) => word.toLowerCase()
    )
  );

  return (
    published
      .filter(
        (item) =>
          item.slug !== post.slug
      )
      .map((item) => ({
        item,
        score:
          (
            item.category === post.category
              ? 10
              : 0
          ) +
          item.keywords.filter((word) =>
            words.has(
              word.toLowerCase()
            )
          ).length * 3
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          String(b.item.date).localeCompare(
            String(a.item.date)
          )
      )
      .slice(0, 3)
      .map(
        ({ item }) => `
          <a
            class="related-card"
            href="${escapeHtml(item.output)}"
          >
            <span>
              ${escapeHtml(item.category)}
            </span>
            <h3>
              ${escapeHtml(item.title)}
            </h3>
            <p>
              ${escapeHtml(item.description)}
            </p>
          </a>
        `
      )
      .join('') ||
    '<p>Altri approfondimenti saranno pubblicati presto.</p>'
  );
}

function structuredData(post) {
  return safeJson({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${SITE_URL}/${post.output}#article`,
        headline: post.title,
        description: post.description,
        image: [
          `${SITE_URL}/${post.heroImage}`
        ],
        datePublished: post.date,
        dateModified:
          post.modified || post.date,
        inLanguage: 'it-IT',
        author: {
          '@type': 'Organization',
          '@id': `${SITE_URL}/#organization`,
          name: post.author
        },
        publisher: {
          '@type': 'Organization',
          '@id': `${SITE_URL}/#organization`,
          name: 'NA Creator Italia',
          logo: {
            '@type': 'ImageObject',
            url: `${SITE_URL}/logo-nacreator.png`
          }
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': `${SITE_URL}/${post.output}`
        },
        keywords: post.keywords.join(', ')
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${SITE_URL}/${post.output}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${SITE_URL}/`
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Articoli',
            item: `${SITE_URL}/articoli.html`
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: post.title,
            item: `${SITE_URL}/${post.output}`
          }
        ]
      }
    ]
  });
}

function faqData(post) {
  const items = post.sections
    .filter(
      (section) =>
        section.enabled &&
        section.type === 'faq'
    )
    .flatMap(
      (section) =>
        section.items || []
    )
    .filter(
      (item) =>
        item.question &&
        item.answer
    );

  if (!items.length) {
    return '';
  }

  return `
    <script type="application/ld+json">
      ${
        safeJson({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: items.map(
            (item) => ({
              '@type': 'Question',
              name: cleanText(item.question),
              acceptedAnswer: {
                '@type': 'Answer',
                text: cleanText(item.answer)
              }
            })
          )
        })
      }
    </script>
  `;
}

function applyTemplate(template, values) {
  return template.replace(
    /{{([A-Z0-9_]+)}}/g,
    (_match, key) =>
      values[key] ?? ''
  );
}

function generateArticle(
  post,
  published,
  template
) {
  const headingIds = new Set();

  const content = post.sections
    .map((section) =>
      renderSection(
        section,
        headingIds
      )
    )
    .join('\n');

  const toc = post.sections
    .filter(
      (section) =>
        section.enabled &&
        section.title &&
        section.headingId
    )
    .map(
      (section) => `
        <a href="#${section.headingId}">
          ${escapeHtml(section.title)}
        </a>
      `
    )
    .join('');

  return applyTemplate(template, {
    TITLE: escapeHtml(post.title),
    SEO_TITLE: escapeHtml(
      post.seoTitle || post.title
    ),
    DESCRIPTION: escapeHtml(
      post.description
    ),
    CANONICAL_URL: escapeHtml(
      post.canonical ||
      `${SITE_URL}/${post.output}`
    ),
    CATEGORY: escapeHtml(post.category),
    DATE: escapeHtml(
      formatDate(post.date)
    ),
    READING_TIME: escapeHtml(
      post.readingTime
    ),
    AUTHOR: escapeHtml(post.author),
    HERO_IMAGE: escapeHtml(
      post.heroImage
    ),
    HERO_IMAGE_ABSOLUTE: escapeHtml(
      `${SITE_URL}/${post.heroImage}`
    ),
    HERO_IMAGE_ALT: escapeHtml(
      post.heroImageAlt
    ),
    HERO_WIDTH:
      Number(post.heroWidth) || 1600,
    HERO_HEIGHT:
      Number(post.heroHeight) || 900,
    LEAD: escapeHtml(post.lead),
    TOC:
      toc ||
      '<p>Nessuna sezione.</p>',
    CONTENT: content,
    RELATED_ARTICLES: relatedFor(
      post,
      published
    ),
    STRUCTURED_DATA:
      structuredData(post),
    FAQ_STRUCTURED_DATA:
      faqData(post)
  });
}

function card(post) {
  return `
    <article class="article-card card reveal">
      <img
        class="article-card-image"
        src="${escapeHtml(post.heroImage)}"
        alt="${escapeHtml(post.heroImageAlt)}"
        width="640"
        height="360"
        loading="lazy"
      >

      <div class="article-meta">
        <span class="shop-badge">
          ${escapeHtml(post.category)}
        </span>

        <span class="article-date">
          ${escapeHtml(
            formatDate(post.date)
          )}
        </span>
      </div>

      <h3>
        ${escapeHtml(post.title)}
      </h3>

      <p>
        ${escapeHtml(post.description)}
      </p>

      <span class="article-date">
        ${escapeHtml(post.readingTime)}
      </span>

      <a
        class="feature-link"
        href="${escapeHtml(post.output)}"
      >
        Leggi articolo →
      </a>
    </article>
  `;
}

const ARTICLE_IMAGE_CSS_START =
  '/* ARTICLE_CARD_IMAGE_CSS_START */';

const ARTICLE_IMAGE_CSS_END =
  '/* ARTICLE_CARD_IMAGE_CSS_END */';

function syncArticleImageCss(html) {
  const cssBlock = `
${ARTICLE_IMAGE_CSS_START}

    .article-card-image {
      display: block;
      width: 100%;
      height: 220px;
      max-width: 100%;
      object-fit: contain;
      object-position: center;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 6px;
      margin-bottom: 18px;
      background: #050812;
    }

    @media (max-width: 520px) {
      .article-card-image {
        height: 200px;
      }
    }

${ARTICLE_IMAGE_CSS_END}
  `.trim();

  const markerPattern =
    /\/\* ARTICLE_CARD_IMAGE_CSS_START \*\/[\s\S]*?\/\* ARTICLE_CARD_IMAGE_CSS_END \*\//;

  if (markerPattern.test(html)) {
    return html.replace(
      markerPattern,
      cssBlock
    );
  }

  if (!html.includes('</style>')) {
    fail(
      'tag </style> mancante in articoli.html'
    );
  }

  return html.replace(
    '</style>',
    `\n${cssBlock}\n</style>`
  );
}

function updateArticlesPage(published) {
  let html = fs.readFileSync(
    ARTICLES_PATH,
    'utf8'
  );

  const start =
    '<!-- ARTICLES_GRID_START -->';

  const end =
    '<!-- ARTICLES_GRID_END -->';

  if (
    !html.includes(start) ||
    !html.includes(end)
  ) {
    html = html.replace(
      /<div class="articles-grid">[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/,
      `
        <div class="articles-grid">
          ${start}
          ${end}
        </div>
      </div>
    </section>
      `
    );
  }

  if (
    !html.includes(start) ||
    !html.includes(end)
  ) {
    fail(
      'marcatori ARTICLES_GRID_START/END mancanti in articoli.html'
    );
  }

  const cards = published.length
    ? published
        .map(card)
        .join('\n')
    : `
      <p class="empty-state">
        Nessun articolo pubblicato al momento.
      </p>
    `;

  html = html.replace(
    new RegExp(
      `${start}[\\s\\S]*?${end}`
    ),
    `${start}\n${cards}\n${end}`
  );

  html = syncArticleImageCss(html);

  fs.writeFileSync(
    ARTICLES_PATH,
    html,
    'utf8'
  );
}

function updateSitemap(published) {
  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const entries = [
    ['/', today, '1.0'],
    ['/articoli.html', today, '0.9'],
    ...published.map((post) => [
      `/${post.output}`,
      post.modified || post.date,
      '0.9'
    ])
  ];

  const xml = `
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    ([url, date, priority]) => `
  <url>
    <loc>${SITE_URL}${url}</loc>
    <lastmod>${date}</lastmod>
    <priority>${priority}</priority>
  </url>
    `.trim()
  )
  .join('\n')}
</urlset>
  `.trim() + '\n';

  fs.writeFileSync(
    SITEMAP_PATH,
    xml,
    'utf8'
  );
}

function main() {
  const posts = loadPosts();

  const now =
    new Date()
      .toISOString()
      .slice(0, 10);

  const published = posts.filter(
    (post) =>
      post.status === 'published' ||
      (
        post.status === 'scheduled' &&
        post.date <= now
      )
  );

  console.log(
    `Validati ${posts.length} articoli (${published.length} pubblicati).`
  );

  if (isValidateOnly) {
    return;
  }

  const template =
    fs.readFileSync(
      TEMPLATE_PATH,
      'utf8'
    );

  const expectedOutputs =
    new Set(
      published.map(
        (post) => post.output
      )
    );

  fs.readdirSync(ROOT)
    .filter(
      (name) =>
        /^articolo-[a-z0-9-]+\.html$/.test(name) &&
        !expectedOutputs.has(name)
    )
    .forEach((name) => {
      const fullPath =
        path.join(ROOT, name);

      if (
        fs.readFileSync(
          fullPath,
          'utf8'
        ).includes(
          '<meta name="generator" content="NA Creator Static CMS">'
        )
      ) {
        fs.rmSync(fullPath);

        console.log(
          `Rimosso ${name}`
        );
      }
    });

  published.forEach((post) => {
    fs.writeFileSync(
      assertLocalPath(
        post.output,
        'output'
      ),
      generateArticle(
        post,
        published,
        template
      ),
      'utf8'
    );

    console.log(
      `Generato ${post.output}`
    );
  });

  posts
    .filter(
      (post) =>
        !published.includes(post)
    )
    .forEach((post) => {
      const output =
        assertLocalPath(
          post.output,
          'output'
        );

      if (fs.existsSync(output)) {
        fs.rmSync(output);
      }
    });

  updateArticlesPage(published);
  updateSitemap(published);

  console.log(
    'Aggiornati articoli.html e sitemap.xml.'
  );
}

try {
  main();
} catch (error) {
  console.error(
    `Errore: ${error.message}`
  );

  process.exitCode = 1;
}