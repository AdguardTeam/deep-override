const fs = require('fs-extra');

fs.remove('./build', (err) => {
    if (err) { console.error(err); process.exit(1); }
    process.exit(0);
});
