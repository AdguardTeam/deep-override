const replace = require('replace-in-file');

replace({
    files:'build/index.js',
    from: /_return\s*=/,
    to: 'var AG_defineProperty ='
}).then(() => {
    process.exit(0);
}).catch((err) => {
    console.error(err);
    process.exit(1);
});
