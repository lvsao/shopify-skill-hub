<h1 align="center">Selofy Shopify Skill Hub</h1>

<p align="center">
  面向 Shopify SEO、内容、店铺审查、商品 Feed 和日常运营的先预览 AI skills。
</p>

<p align="center">
  <a href="https://skills.sh/lvsao/shopify-skill-hub">使用 skills.sh 安装</a>
  ·
  <a href="https://www.selofy.com/shopify-skill-hub">打开 Skill Hub</a>
  ·
  <a href="./README.md">English</a>
</p>

<p align="center">
  <a href="https://skills.sh/lvsao/shopify-skill-hub"><img src="https://img.shields.io/badge/install-skills.sh-2563eb" alt="使用 skills.sh 安装"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow.svg" alt="MIT license"></a>
  <a href="https://www.shopify.com/"><img src="https://img.shields.io/badge/built%20for-Shopify-7AB55C?logo=shopify&logoColor=white" alt="Built for Shopify"></a>
</p>

每个 skill 都是可在 GitHub 直接审查的文件夹，包含明确的触发场景、限制说明，以及经过批准后才写入 Shopify 的流程。

## 按任务选择

| 如果你想要…… | 从这里开始 | 覆盖内容 |
| --- | --- | --- |
| 发布有价值的内容 | [`wechat-to-shopify-blog`](./skills/wechat-to-shopify-blog) · [内容目录](./catalog/content-creation) | 将已拥有或已授权的微信公众号文章转换为 Shopify 博客草稿。 |
| 提升自然流量 | [`optimize-shopify-alt-text`](./skills/optimize-shopify-alt-text) · [`shopify-product-serp-optimizer`](./skills/shopify-product-serp-optimizer) · [SEO 目录](./catalog/seo-growth) | 优化图片 alt text、商品搜索摘要、博客 SEO，并研究外链机会。 |
| 检查或运营店铺 | [`shopify-operations-brief`](./skills/shopify-operations-brief) · [`shopify-theme-apps-detector`](./skills/shopify-theme-apps-detector) · [`shopify-markets-localization-auditor`](./skills/shopify-markets-localization-auditor) · [运营目录](./catalog/operations) | 查看销售、发货、库存提醒和店铺运营情况。 |
| 准备商品 Feed 或物流 | [`shopify-gmc-misrepresentation-auditor`](./skills/shopify-gmc-misrepresentation-auditor) · [`yuntu-yw-shipping`](./skills/yuntu-yw-shipping) · [商品 Feed 目录](./catalog/product-feed) | 审查 Google Merchant Center 风险，准备云途或燕文物流请求。 |

## 快速开始

```bash
# 查看可用 skills
npx skills add lvsao/shopify-skill-hub --list

# 安装单个 skill
npx skills add lvsao/shopify-skill-hub --skill <skill-name>

# 或安装全部公开 skills
npx skills add lvsao/shopify-skill-hub
```

## 工作流程

| 选择 | 预览 | 批准 |
| --- | --- | --- |
| 选择与任务匹配的 skill。 | 读取店铺上下文，生成计划、报告或草稿。 | 审核建议内容后，才允许写入 Shopify。 |

## 查看完整目录

<details>
<summary>展开全部公开 skills</summary>

| Skill | 分类 | 适用场景 |
| --- | --- | --- |
| [`wechat-to-shopify-blog`](./skills/wechat-to-shopify-blog) | 内容 | 将已拥有或已授权的微信公众号文章转换为 Shopify 博客草稿。 |
| [`optimize-shopify-alt-text`](./skills/optimize-shopify-alt-text) | SEO | 审查并优化商品、集合和文章图片的 alt text。 |
| [`shopify-product-serp-optimizer`](./skills/shopify-product-serp-optimizer) | SEO | 分批优化商品搜索结果摘要和 SEO 元数据。 |
| [`shopify-blog-seo-optimizer`](./skills/shopify-blog-seo-optimizer) | SEO | 审查 Shopify 文章并准备可审核的 SEO 改进。 |
| [`seo-backlink-opportunity-finder`](./skills/seo-backlink-opportunity-finder) | SEO | 研究有证据支持的外链机会，不承诺投放或收录。 |
| [`shopify-gmc-misrepresentation-auditor`](./skills/shopify-gmc-misrepresentation-auditor) | 商品 Feed | 审查公开店铺页面的 Google Merchant Center 政策风险。 |
| [`shopify-theme-apps-detector`](./skills/shopify-theme-apps-detector) | 运营 | 基于证据检测公开 Shopify 店铺的主题和插件。 |
| [`shopify-store-translator`](./skills/shopify-store-translator) | 运营 | 用先预览、后批准的流程翻译 Shopify 店铺资源。 |
| [`shopify-markets-localization-auditor`](./skills/shopify-markets-localization-auditor) | 运营 | 检查 Markets、语言、配送覆盖和国际 SEO 准备度。 |
| [`shopify-product-images-downloader`](./skills/shopify-product-images-downloader) | 运营 | 下载公开 Shopify 店铺的商品图片。 |
| [`shopify-checkout-payment-connection-check`](./skills/shopify-checkout-payment-connection-check) | 运营 | 不下单，检查结账、配送选项和支付配置。 |
| [`shopify-operations-brief`](./skills/shopify-operations-brief) | 运营 | 生成只读店铺经营概览与私有 HTML 报告。 |
| [`yuntu-yw-shipping`](./skills/yuntu-yw-shipping) | 运营 | 查询、报价和准备云途或燕文物流请求。 |

完整的描述、功能、集成和权限标记，请查看 [`catalog/`](./catalog)。
</details>

## 权限与安全

- GMC 审查、主题/插件检测、商品图片下载和外链机会研究等公开网页 skill 不需要 Shopify 凭证。
- 需要连接店铺的 skill 会在自己的 `SKILL.md` 中说明权限。流程先读取和预览；写入 Shopify 必须经过明确批准。
- 如果 skill 需要凭证，请将 [`examples/skill-hub.env.example`](./examples/skill-hub.env.example) 复制为私有 `skill-hub.env`。不要提交 token 或商家数据。

## 仓库

```text
skills/    Skill 的核心说明和脚本
catalog/   Skill Hub 与同步任务使用的公开元数据
examples/  本地配置模板
scripts/   校验和同步工具
```

`catalog/` 是 Skill Hub 的公开元数据源。推送到 `main` 后，GitHub Actions 会先校验变更，再同步到 Selofy Web。

维护仓库时，请同时更新 skill 文件夹和 catalog 条目，然后运行：

```bash
node scripts/sync-onboarding.mjs --check
node scripts/release-preflight.mjs
```

贡献规范请查看 [`CONTRIBUTING.md`](./CONTRIBUTING.md)，安全问题请查看 [`SECURITY.md`](./SECURITY.md)。

## License

MIT。
