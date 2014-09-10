var path = require('path');
var gutil = require('gulp-util');
var merge = require('deepmerge');
var through = require('through2');
var watchify = require('watchify');
var browserify = require('browserify');
var source = require('vinyl-source-stream');

var browserifyCache = {};
var watchifyCache = {};

function getBundle(file, opt) {
  var cache = opt.watch ? watchifyCache : browserifyCache;
  if (cache[file.path]) return cache[file.path];

  var bundle = opt.watch ? watchify(opt) : browserify(opt);
  cache[file.path] = bundle;
  opt.setup && opt.setup(bundle);

  if (!(opt.require && opt.require.length)) {
    var self = path.dirname(path.relative(opt.basedir || file.base, file.path)) + '/' + path.basename(file.path, path.extname(file.path));
    opt.requireSelf && bundle.require(self);
  }

  var transforms = opt.transforms || [];
  for (var i = 0; i < transforms.length; i++) {
    bundle.transform(transforms[i]);
  }

  var external = opt.external || [];
  for (i = 0; i < external.length; i++) {
    bundle.external(external[i][0], external[i][1]);
  }

  var require = opt.require || [];
  for (i = 0; i < require.length; i++) {
    bundle.require(require[i][0], require[i][1]);
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
    var base = opt.basedir || file.base;
    var options = merge(opt, {entries: './' + path.relative(base, file.path), basedir: base });

    var stream = this;
    var bundle = getBundle(file, options);

    function rebundle() {
      gutil.log(
        bundle.first ? "Bundling" : "Rebundling",
        gutil.colors.magenta(file.relative),
        opt.watch !== false ? '(watch mode)':''
      );

      var newStream = bundle.bundle(merge({}, opt))
        .on('error', function(error) {
          stream.emit('error', error);
          //bundle.first && callback();
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
