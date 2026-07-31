# Selofy Shopify Skill Hub

[![使用 skills.sh 安装](https://img.shields.io/badge/install-skills.sh-2563eb)](https://skills.sh/lvsao/shopify-skill-hub)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)
[![Shopify](https://img.shields.io/badge/built%20for-Shopify-7AB55C?logo=shopify&logoColor=white)](https://www.shopify.com/)

面向 Shopify 和电商运营者的开源 AI agent skills。

语言：[English](./README.md) | 中文

每个 skill 都是可在 GitHub 直接审查的文件夹，包含明确的触发场景、限制说明，以及先预览再写入 Shopify 的安全流程。

## 安装

查看可用 skills：

```bash
npx skills add lvsao/shopify-skill-hub --list
```

安装单个 skill：

```bash
npx skills add lvsao/shopify-skill-hub --skill <skill-name>
```

安装全部公开 skills：

```bash
npx skills add lvsao/shopify-skill-hub
```

## 当前 skills

下表是当前公开 skill 索引，名称均链接到对应源码目录。

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
| [`yuntu-yw-shipping`](./skills/yuntu-yw-shipping) | 运营 | 查询、报价和准备云途或燕文物流请求。 |

完整的描述、功能、集成和权限标记，请查看 [`catalog/`](./catalog) 中对应的条目。

## Shopify 权限与安全

- GMC 审查、主题/插件检测、商品图片下载和外链机会研究等公开网页 skill 不需要 Shopify 凭证。
- 需要连接店铺的 skill 会在自己的 `SKILL.md` 中说明权限。流程应先读取和预览；写入 Shopify 必须经过明确批准。
- 如果 skill 需要凭证，请将 [`examples/skill-hub.env.example`](./examples/skill-hub.env.example) 复制为工作目录中的私有 `skill-hub.env`。不要提交 token 或商家数据。

## 仓库结构

```text
skills/    Skill 的核心说明和脚本
catalog/   Skill Hub 与同步任务使用的公开元数据
examples/  本地配置模板
scripts/   校验和同步工具
```

`catalog/` 是 Skill Hub 的公开元数据源。推送到 `main` 后，GitHub Actions 会先校验变更，再同步到 Selofy Web。

## 参与维护

Skill 名称使用小写短横线格式。新增或修改 skill 时，请同时更新 skill 文件夹和 catalog 条目，然后运行：

```bash
node scripts/sync-onboarding.mjs --check
node scripts/release-preflight.mjs
```

## License

MIT。
