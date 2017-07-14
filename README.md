## About

Experimental function to transparently override nested JS objects.

Makes use of ES6 [Proxy](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Proxy).

Does not leave messy property descriptors behind.

(Todo) falls back to `Object.defineProperty` when `Proxy` is unavailable.