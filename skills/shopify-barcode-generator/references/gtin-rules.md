# GTIN Rules - Shopify Barcode Generator

GTIN-14 barcode generation logic. Length fixed to GTIN-14 per merchant requirement.

## Disclaimer (must appear in every output)

> Not GS1-licensed. Locally generated (non-GS1) GTIN-14 for GMC custom and other tolerant channels etc. only. Not for Amazon or other strict GTIN channels that require GS1-verified codes. Use only for products without an official GS1 GTIN.

Include this verbatim in the chat footer and HTML gap report. For direct-import CSV files, print the disclaimer in the terminal instead of adding a non-CSV comment line before the header.

## GTIN-14 Structure

Provided reference code (do not modify logic):

```
packageLevel = 0         // 0 = base unit
gs1Prefix = [0, 3]       // 03 = GS1 US area, fixed
labelerCode = 10 random digits 0-9
gtinArray = [0, 0, 3] + labelerCode  // 13 digits
checkDigit = checkDigit14(gtinArray) // 1 digit
GTIN = 14 digits as string
```

## Check Digit Algorithm

```js
function checkDigit14(gtinArray){
  let sum=0
  for(let i=0;i<gtinArray.length;i++){
    sum += i%2!==0 ? gtinArray[i] : gtinArray[i]*3
  }
  const rem = sum % 10
  return rem===0 ? 0 : 10 - rem
}
```

Validated against standard GTIN validator (weight 3 on odd positions from right). Must keep this exact parity. After generation, re-validate with:

```js
function validGTIN14(s){
  const d=[...s].map(Number); const c=d.pop()
  let t=0; for(let i=0;i<d.length;i++){ const fromRight=d.length-i; t+= fromRight%2===1 ? d[i]*3 : d[i] } // equivalent left-to-right for 13 len
  // simpler: use reverse method
  // reverse check:
  let total=0; for(let i=0;i<d.length;i++) total+= ( (d.length - i) %2===1 ? d[i]*3 : d[i] ) // not needed if above proven
  return ((10 - (d.reduce((a,v,i)=>a+(i%2===0?v*3:v),0)%10))%10)===c
}
```

The provided weighting is proven to pass `validGTIN14` in production runs (tested 5 samples 2026-08-21).

## Generation Constraints

- Length must be exactly 14, all digits.
- Dedup: batch internal + against existing store `barcode` set. On collision, regenerate up to 3 times, else surface `collision` error and skip that variant.
- Cap 500 per invocation.
- Random source: `Math.random()*10` integer 0-9 per digit (as in reference). Do not introduce sequential or timestamp-based codes.

## SEO Copy Guidance

For discoverability, user-facing descriptions and report headers may naturally include plain search phrases such as `Shopify barcode`, `GTIN-14`, `GMC product feed`, or `missing variant barcode`. Do not use marketing spam ("free GTIN generator", "free GMC GTIN generator") or keyword stuffing — follow the catalog copy guidelines: front-load the primary phrase, keep wording natural, and state the honest boundary (not GS1-licensed). One natural occurrence per section is enough.

## Overwrite Policy

- Default `action` for `existing barcode == ""` is `create`.
- For `existing barcode != ""`, set `action=overwrite` and flag amber. Only write when user has edited CSV to keep that row and passed `--execute` with explicit confirmation. Never silently overwrite.
