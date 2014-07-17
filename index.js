var path = require('path');
var gutil = require('gulp-util');
var merge = require('deepmerge');
var through = require('through2');
var watchify = require('watchify');
var source = require('vinyl-source-stream');

var browserifyCache = {};
var watchifyCache = {};

function getBundle(file, opt) {
  var cache = opt.watch ? watchifyCache : browserifyCache;
  if (cache[file.path]) return cache[file.path];

  var bundle = opt.watch ? watchify(opt) : watchify.browserify(opt);
  cache[file.path] = bundle;
  opt.setup && opt.setup(bundle);

  var self = './' + path.basename(file.relative, path.extname(file.relative));
  opt.requireSelf && bundle.require(self);

  var transforms = opt.transforms || [];
  for (var i = 0; i < transforms.length; i++) {
    bundle.transform(transforms[i]);
  }

  bundle.first = true;

  return bundle;
}

module.exports = function(opt) {
  return through.obj(function(file, enc, callback) {
    if (file.isNull()) {
      this.push(file); // Do nothing if no contents
      return callback();
    }
    if (file.isStream()) {
      return callback(new Error('Streams are not supported'));
    }
    var options = merge(opt, {entries: './'+file.relative, basedir: file.base });

    var stream = this;
    var bundle = getBundle(file, options);

    function rebundle() {
      gutil.log(
        bundle.first ? "Bundling" : "Rebundling",
        gutil.colors.magenta(file.relative),
        opt.watch !== false ? '(watch mode)':''
      );

      var newStream = bundle.bundle(opt)
        .on('error', function(error) {
          stream.emit('error', error);
          stream.emit('end');
          callback();
        })
        .pipe(source('./'+file.relative));
      newStream.on('data', function(data) {
        stream.push(data);
      });
      newStream.on('end', function() {
        bundle.first && callback();
        if (opt.watch) bundle.first = false;
      });
    }

    bundle.on('update', rebundle);
    rebundle();
  }, function() {
    if (!opt.watch) this.emit('end');
  });
}
