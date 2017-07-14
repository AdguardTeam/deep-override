const gulp = require('gulp');
const closureCompiler = require('google-closure-compiler').gulp();
const mocha = require('gulp-mocha');
const insert = require('gulp-insert');


const cc_options = {
    compilation_level: 'ADVANCED',
    language_in: 'ECMASCRIPT6',
    language_out: 'ECMASCRIPT5',
    //output_wrapper: 'var deepOverride=(function(){%output%})();',
    js_output_file: 'deep-override.min.js',
    externs: ['externs.js'],
    //isolation_mode: 'IIFE',
    assume_function_wrapper: true,
    warning_level: 'VERBOSE',
    use_types_for_optimization: true
};

gulp.task('min', () => gulp.src('./index.js', {base: './'})
    .pipe(closureCompiler(cc_options))
    .pipe(insert.transform((content) => {
        content = content.replace(/this\.AG_defineProperty=([\s\S]*)$/, 'return $1');
        content = content.trim();
        content = `var AG_defineProperty=(function(){${content}}).call(window);`
        return content;
    }))
    .pipe(gulp.dest('./'))
);
 
gulp.task('test', () => gulp.src('test.js', {read: false})
    .pipe(mocha({
        ui: 'tdd',
        reporter: 'spec'
    }))
);
