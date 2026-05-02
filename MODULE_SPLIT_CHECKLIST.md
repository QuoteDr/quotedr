# Quote Builder Module Split Checklist

Keep extractions small and behavior-preserving. Each module should continue exporting the existing global function names until inline handlers are removed.

- [x] IKEA Quick Quote -> `ikea-quote.js`
- [ ] Floor Plan Scanner -> `floor-plan-scanner.js`
- [x] Quote Style Modal -> `quote-style.js`
- [ ] Manage Items -> `quote-items.js`
- [x] Client Management -> `quote-clients.js`
- [ ] Material Estimator / Calculators -> `quote-calculators.js`
- [ ] Quote save/load/session core -> `quote-storage.js`
