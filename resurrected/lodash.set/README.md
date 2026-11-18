# lodash.set (resurrected)
Revenant rebuild of `lodash.set` 4.3.2, written in Kiro from the generated spec bundle. It matches the original on all recorded behavior except one intentional difference: paths that would write to `Object.prototype`, `Function.prototype` or `Array.prototype` are refused (GHSA-p6mc-m468-83gw).
## Credit
The original package was created by John-David Dalton (<john.david.dalton@gmail.com>, http://allyoucanleet.com/). Contributors: Blaine Bublitz and Mathias Bynens. Original project: https://lodash.com/ (repository `lodash/lodash`).
## License
MIT. See `LICENSE`, copied unchanged from the original package.
