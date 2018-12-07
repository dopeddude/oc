'use strict';

const async = require('async');
const _ = require('lodash');

const eventsHandler = require('./events-handler');
const getUnixUTCTimestamp = require('oc-get-unix-utc-timestamp');

module.exports = (conf, cdn) => {
  const returnError = (code, message, callback) => {
    eventsHandler.fire('error', { code, message });
    return callback(code);
  };

  const filePath = () => `${conf.s3.componentsDir}/components-details.json`;

  const getFromJson = callback => cdn.getJson(filePath(), true, callback);

  const getFromDirectories = (options, callback) => {
    const details = _.extend({}, _.cloneDeep(options.details));
    details.components = details.components || {};

    try {
      const componentsCacheList = options.componentsList.components;
      Object.keys(details.components).forEach(((componentName) => {
        const publishedVersions = Object.keys(details.components[componentName]);
        publishedVersions.forEach((publishedVersion) => {
          if (componentsCacheList[componentName] instanceof Array) {
            if (componentsCacheList[componentName].indexOf(publishedVersion) === -1) {
              details.components[componentName][publishedVersion]["onDiskPresence"] = false;
              if (publishedVersion.startsWith('0.0.1-') === true) {
                delete details.components[componentName][publishedVersion];
              }
            } else {
              details.components[componentName][publishedVersion]["onDiskPresence"] = true;
            }
          }
        });
      }));
    } catch (error) {
      console.error("Error on sanitizing the components Details", error);
    }

    async.eachOfSeries(
      options.componentsList.components,
      (versions, name, done) => {
        details.components[name] = details.components[name] || {};

        async.eachLimit(
          versions,
          cdn.maxConcurrentRequests,
          (version, next) => {
            if (details.components[name][version]) {
              next();
            } else {
              cdn.getJson(
                `${conf.s3.componentsDir}/${name}/${version}/package.json`,
                true,
                (err, content) => {
                  if (err) {
                    return next(err);
                  }
                  details.components[name][version] = {
                    publishDate: content.oc.date || 0
                  };
                  next();
                }
              );
            }
          },
          done
        );
      },
      err =>
        callback(err, {
          lastEdit: getUnixUTCTimestamp(),
          components: details.components
        })
    );
  };

  const save = (data, callback) =>
    cdn.putFileContent(JSON.stringify(data), filePath(), true, callback);

  const refresh = (componentsList, callback) => {
    getFromJson((jsonErr, details) => {
      getFromDirectories({ componentsList, details }, (dirErr, dirDetails) => {
        if (dirErr) {
          return returnError('components_details_get', dirErr, callback);
        } else if (
          jsonErr ||
          !_.isEqual(dirDetails.components, details.components)
        ) {
          save(dirDetails, saveErr => {
            if (saveErr) {
              return returnError('components_details_save', saveErr, callback);
            }

            callback(null, dirDetails);
          });
        } else {
          callback(null, details);
        }
      });
    });
  };

  return {
    get: getFromJson,
    refresh
  };
};
