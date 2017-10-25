## About

Experimental function to transparently override nested JS objects.

Makes use of ES6 [Proxy](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Proxy).

Does not leave messy property descriptors behind.

(Todo) falls back to `Object.defineProperty` when `Proxy` is unavailable.

## How to build

Install dependencies by running:
```
yarn install
```
The dev build without minification can be built with:
```
yarn run build-dev
```
The minified build is available with:
```
yarn run build
```
