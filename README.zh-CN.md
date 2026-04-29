# Selofy Shopify Skill Hub

[![Install with skills](https://img.shields.io/badge/install-npx%20skills%20add-111827?logo=npm&logoColor=white)](https://github.com/lvsao/shopify-skill-hub)
[![Skills](https://img.shields.io/badge/skills-3-2563eb)](./skills)
[![Categories](https://img.shields.io/badge/categories-6-16a34a)](./catalog)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE)
[![Shopify](https://img.shields.io/badge/built%20for-Shopify-7AB55C?logo=shopify&logoColor=white)](https://www.shopify.com/)

面向 Shopify 和电商运营者的公开 AI agent skills。

语言：[English](./README.md) | 中文

## 关于

Selofy Shopify Skill Hub 是一个免费、开源的 AI agent skills 仓库，面向 Shopify 卖家。你可以用它安装透明、可审查的工作流，用于 Shopify 内容创作、SEO 增长、商品 feed 清理、店铺设置、社媒内容复用和日常电商运营。

这个仓库是 Skill Hub 的公开内容源：

- Skills 是可在 GitHub 审查的文件夹，不是隐藏 prompt。
- Skills 可以包含小型原生脚本，让执行更安全、更稳定。
- Shopify 写入必须先预览，并且只在用户批准后执行。
- 新手引导应把 Shopify API 凭证保存在一个本地私有 env 文件中。
- Skills 通过 `skills` CLI 安装，后续也可以同步到 Selofy Web。

## 安装

安装这个仓库里的全部公开 skills：

```bash
npx skills add lvsao/shopify-skill-hub
```

只安装某一个 skill，可以使用 `--skill`。例如，只安装 WeChat to Shopify Blog：

```bash
npx skills add lvsao/shopify-skill-hub --skill wechat-to-shopify-blog
```

只安装 Shopify alt text 优化 skill：

```bash
npx skills add lvsao/shopify-skill-hub --skill optimize-shopify-alt-text
```

只安装 Shopify 商品搜索结果优化 skill：

```bash
npx skills add lvsao/shopify-skill-hub --skill shopify-product-serp-optimizer
```

安装前查看可用 skills：

```bash
npx skills add lvsao/shopify-skill-hub --list
```

维护者在本地修改仓库时，可以从当前 checkout 预览 skills：

```bash
npx skills add . --list
```

这个本地命令只适合维护者。普通用户应使用 GitHub 安装命令：`npx skills add lvsao/shopify-skill-hub`。

## 当前 Skills

| Skill | 分类 | 用途 |
| --- | --- | --- |
| `wechat-to-shopify-blog` | `content-creation` | 将已拥有或已授权的微信公众号文章转换为 Shopify 博客草稿，包括 Shopify Files 图片托管、品牌语气适配、博客选择和相关商品插入。 |
| `optimize-shopify-alt-text` | `seo-growth` | 审查 Shopify 商品媒体、集合封面图、文章封面图和文章正文图片，并生成先预览再执行的 alt text 优化计划；可用时使用真实图片理解，不可用时安全回退到上下文字段。 |
| `shopify-product-serp-optimizer` | `seo-growth` | 扫描 Shopify 商品，规划每批 5 个商品的搜索结果优化任务，生成结构清晰的 HTML 审查报告，并且只应用已批准的商品 SEO 元数据或已审核的媒体 alt 更新。 |

## Shopify API 权限与 Env 配置

大多数 Skill Hub skills 需要有限的 Shopify Admin API 权限，才能读取店铺上下文或准备预览。主要有两种方式释放您店铺的 API 权限。如果您是新手，请放心，安装任意 skill 后，AI agents 都会从 0-1 引导您完成环境配置。请把凭证保存在当前工作目录里的一个私有本地文件中：

```text
skill-hub.env
```

这个仓库目前使用两种环境文件格式。

### Dev Dashboard app（recommanded）

1. 创建 Shopify Partner 账号。
2. 在 Dev Dashboard 创建 app。
3. 在 `Distribution` 中选择 custom distribution，并安装到自己的店铺。
4. 在 app settings 中复制 Client ID。
5. 在 `skill-hub.env` 中使用店铺准确的 `.myshopify.com` 域名。

教程：https://www.selofy.com/tutorials/ai-ecommerce/shopify-ai-agents-custom-app-skill

最小模板：

```text
# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=dev_dashboard_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SKILL_HUB_SHOPIFY_CLIENT_ID=your-client-id
```

对于这个仓库当前使用的 Shopify CLI `store auth` 流程，不需要 `SKILL_HUB_SHOPIFY_CLIENT_SECRET`。Agent 会通过 Shopify CLI 应用所需 scopes，然后对目标店铺执行 `shopify store auth`。

### Shopify 店铺 Settings custom app（Legacy Custom App）

只有当你的店铺 Settings 仍允许创建 Legacy Custom App，并且你更希望直接使用 Admin token 路径时，再使用这种方式。

教程：https://www.selofy.com/tutorials/ai-ecommerce/ai-agents-skills-shopify-operations

最小模板：

```text
# Skill Hub shared Shopify configuration
# Keep this file private. Do not commit it or paste tokens into chat.

SKILL_HUB_SHOPIFY_ACCESS_METHOD=admin_custom_app
SKILL_HUB_SHOPIFY_STORE_DOMAIN=your-store.com
SKILL_HUB_SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxx
```

Skill 脚本会在调用 Admin GraphQL 前解析出正确的 Shopify Admin API host。

Shopify 指南：[Create custom apps in Shopify](https://help.shopify.com/en/manual/apps/app-types/custom-apps)

### 重要说明

- `skill-hub.env` 是当前工作目录下多个 skills 共用的配置文件。
- 不同 skill 需要的 Admin scopes 可能不同，但 env 文件结构不变。
- Dev Dashboard 使用 `store domain + client id`，因为授权通过 Shopify CLI 完成。
- Legacy Custom App 使用 `store domain + admin token`，因为 token 由店铺后台创建。

## 仓库结构

```text
skills/
  wechat-to-shopify-blog/
    SKILL.md
    agents/
      openai.yaml
    scripts/
      shopify-context.mjs
      related-product-block.mjs
  optimize-shopify-alt-text/
    SKILL.md
    agents/
      openai.yaml
    references/
      alt-text-rules.md
    scripts/
      shopify-alt-text-admin.mjs
  shopify-product-serp-optimizer/
    SKILL.md
    agents/
      openai.yaml
    assets/
      report-template.html
    references/
      serp-methodology.md
    scripts/
      shopify-product-serp-admin.mjs
catalog/
  INDEX.json
  content-creation/
    CATEGORY.md
    skills.json
  seo-growth/
    CATEGORY.md
    skills.json
  product-feed/
    CATEGORY.md
    skills.json
  store-setup/
    CATEGORY.md
    skills.json
  social-media/
    CATEGORY.md
    skills.json
  operations/
    CATEGORY.md
    skills.json
examples/
  skill-hub.env.example
AGENTS.md
LICENSE
README.md
README.zh-CN.md
```

## 分类

分类以文件夹为先。每个分类都位于 `catalog/<category-slug>/`，方便用户在 GitHub 上自然浏览。`catalog/INDEX.json` 只是用于同步任务和 UI 工具的机器可读索引。

Selofy Web 当前使用这些公开 Skill Hub 分类 slug：

- `content-creation`
- `seo-growth`
- `product-feed`
- `store-setup`
- `social-media`
- `operations`

除非先更新 Selofy Web，否则请继续使用这些文件夹名和 slug。

## License

MIT。这样公开 skills 更容易审查、复用、fork 和安装。
