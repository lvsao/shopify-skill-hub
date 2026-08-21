# Report Schema

The command generates one dependency-free HTML file with a restrictive CSP. Resolve locale from `--lang`; agents should pass the latest report-request language (`zh-CN` or `en`).

Required reading order is: context → executive summary → metrics → grouped findings → healthy sample → evidence, limitations, and approval boundary. The report must:

- use escaped untrusted content only, semantic headings/tables, text-plus-color status badges, responsive table overflow, and print styles;
- distinguish blocked, not tested, no findings, and public candidates; connected Admin evidence is emitted by the connected JSON commands, not this public HTML report;
- state that public mode never writes data and cannot identify Admin-only redirect conditions;
- keep the 404 probe outside metrics and candidate rows; and
- avoid external fonts, scripts, images, and dependencies.
