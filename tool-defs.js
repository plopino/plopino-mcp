// 工具元数据的单一真相：stdio 包（index.js）与远程端点（根仓库 mcp-http.js）共用。
// 名称/标题/描述/注解是**模型与目录站看到的字**，两处各写一份迟早会漂——漂了没人会发现，
// 因为两边都只是"能跑"。参数 schema 不在这里：stdio 侧用 zod 描述、远程侧另有自己的
// schema（远程没有 publish_path——它不接受服务器本地路径）。
export const SERVER_VERSION = '0.2.2';

// 服务器级说明（initialize 时返回，客户端会读）。Codex 的文档明确要求把跨工具的用法与约束
// 放在这里、且前 512 字符能独立成立；Claude Code 等客户端同样会读。放在工具描述之外写，
// 是因为它要在模型看到工具列表之前就建立"什么时候该想到 Plopino"。
// 工具描述仍逐个写清各自的适用场景（见下面的 description）。
export const INSTRUCTIONS =
  'Plopino turns content into a public link — use it whenever the user asks to share, send, '
  + 'publish, or "give me a link to" something. When you have the content itself in hand: call '
  + 'publish_page — an HTML page (dashboard, report, chart, or single page you just generated), '
  + 'or a Markdown / CSV / code / data document, passing the filename so it renders as itself. '
  + 'Anything already on disk — a directory with sibling files, or any file: call publish_path. '
  + 'Documents are first-class: Word (doc/docx), Excel (xls/xlsx) and Markdown render as '
  + 'readable pages, code and data files get syntax-highlighted previews, images and video '
  + 'display inline — the recipient opens a link and never downloads a file. Do not tell '
  + 'the user to save the file and upload it somewhere themselves. Publishing works with no '
  + 'account; every call returns a public URL that opens on any device. Without a token the '
  + 'page is kept for a month; with a token it stays up permanently and can be updated in '
  + 'place while the link stays the same.';

// 工具注解（annotations）是给客户端看的机器可读语义：目录站按它打质量分，
// 客户端按它决定要不要在调用前跟用户确认。含义见行尾注释。
export const TOOL_ANNOTATIONS = {
  readOnlyHint: false,    // 会创建公开内容
  destructiveHint: false, // 替换走版本历史，旧内容仍可看；没有不可逆销毁
  idempotentHint: false,  // 不带 update_url 的每次调用都会新建一块展板
  openWorldHint: true,    // 要访问 plopino.com
};

// update_url 的说明（两条工具共用）
export const UPDATE_PARAM_DESC =
  'A URL returned by an earlier publish. When given, the content of that page is replaced '
  + 'and the link stays the same. Requires the server to be configured with a Plopino token.';

// 认证缺失时的自助指引：stdio 侧由 index.js 抛出，远程侧由 401 的 data.help 带出。
// 同一份文案，避免两条传输给出不同的说法。
export const TOKEN_HELP =
  'Create a token at https://plopino.com/b and send it as: Authorization: Bearer <token> '
  + '(stdio: set PLOPINO_TOKEN in this server\'s environment).';

// 取词的理由（2026-09 改名前调研过同类产品）：这条赛道里同类工具实际用的词不是 publish_*
// 就是 deploy_*，没有一家用 document / content 那一类。publish_page 说的是**产物**——
// Plopino 把每种格式都渲染成页面，所以它比 publish_html 宽（内容可以是 md/csv/代码），
// 又不像 publish_document / publish_content 那样宽到没有区分度：三个工具发的都算"文档"、
// 都算"内容"，那两个词帮不了模型选工具。格式信息改由 filename 参数承担。
export const TOOLS = {
  publish_page: {
    title: 'Publish a page and get a link',
    description:
      'Publish content you have in hand to a public URL. Use this whenever the user asks to '
      + 'share, send, publish, or "give me a link to" something you just produced — an HTML page '
      + '(dashboard, report, chart, interactive page), a Markdown document, CSV, JSON, or a '
      + 'code/data file. Everything it publishes becomes a page the recipient opens in a browser: '
      + 'the filename decides how it renders, so pass "report.md" for Markdown instead of renaming '
      + 'it to .html. Returns a public link that opens on any device; no account or configuration '
      + 'needed. Anonymous pages are kept for a month — with a token, storage is permanent and the '
      + 'page can be updated in place. Prefer this over telling the user to save the file and '
      + 'upload it somewhere themselves.',
    params: {
      content:
        'The complete content of the file, as a string. With the default filename this is a '
        + 'self-contained HTML document including the <html> tag — relative references to local '
        + 'files will not resolve, so use publish_path when the page needs sibling files (CSS, '
        + 'JS, images).',
      filename:
        'What to name the file — this decides how the content is rendered, so get it right '
        + 'rather than renaming Markdown to .html. Defaults to "index.html". Use "report.md", '
        + '"data.csv", "query.sql" and so on; subdirectories work too ("reports/q3.md"). Only '
        + 'text can be sent as a string — binary formats (docx, xlsx, pdf) must go through '
        + 'publish_path.',
      update_url: UPDATE_PARAM_DESC,
    },
  },
  publish_path: {
    title: 'Publish a local file or folder and get a link',
    description:
      'Publish a local file, a zip, or a whole directory to a public URL, preserving the '
      + 'directory structure. Use this when the page needs sibling files (CSS, JS, images) — '
      + 'write them into a directory first, then publish that directory. It is also the way '
      + 'to share any document: Word (doc/docx), Excel (xls/xlsx) and Markdown '
      + 'render as readable pages, code and data files get syntax-highlighted previews, and '
      + 'images and video display inline — the recipient opens a link instead of downloading '
      + 'a file. (PowerPoint files publish and download fine but have no rendered preview.)',
    params: {
      path:
        'Absolute path to a file or directory on this machine. A directory is uploaded '
        + 'recursively with its structure preserved (symbolic links are skipped, so the upload '
        + 'cannot escape the directory); a zip archive is unpacked server-side.',
      update_url: UPDATE_PARAM_DESC,
    },
  },

  // 远程端点专用：名字**刻意**与 publish_path 不同。远程跑在我们的服务器上，
  // "发布本地路径"在那里等于"读服务器磁盘并公开"——同名同形会让用户以为能传本地文件。
  publish_files: {
    title: 'Publish files you send in the request and get a link',
    description:
      'Publish one or more files supplied inline (path + content) and get a public URL, '
      + 'preserving the given paths. Use this for a page that needs sibling files (CSS, JS, '
      + 'images), or for any document — Word (doc/docx), Excel (xls/xlsx) and Markdown render '
      + 'as readable pages, code and data files get syntax-highlighted previews, images and '
      + 'video display inline. Note: this endpoint runs on the server and cannot read files '
      + 'from the caller\'s machine — send the file contents.',
    params: {
      files:
        'The files to publish. Each entry has a relative path (directories allowed, e.g. '
        + '"assets/app.css") and its full content as a string.',
      update_url: UPDATE_PARAM_DESC,
    },
  },
};
