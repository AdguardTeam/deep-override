const replace = require('replace-in-file');

replace({
    files:'build/index.js',
    from: /_return\s*=/,
    to: 'var AG_defineProperty ='
}).then(() => {
    return replace({
        files:'build/index.js',
        from: /^\s*var DEBUG\s*=\s*false/,
        to: 'var DEBUG = true'
    });
}).then(() => {
    process.exit(0);
}).catch((err) => {
    console.error(err);
    process.exit(1);
});
