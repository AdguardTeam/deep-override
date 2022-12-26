const replace = require('replace-in-file');
const fs = require('fs-extra');

fs.remove('./build/tscc', (err) => {
    if (err) { console.error(err); process.exit(1); }
    replace({
        files:'build/index.js',
        from: /_return=/,
        to: 'return '
    }).then(() => {
        return replace({
            files:'build/index.js',
            from: /\r?\n/g,
            to: ''
        });
    }).then(() => {
        process.exit(0);
    }).catch((err) => {
        console.error(err);
        process.exit(1);
    });
});
