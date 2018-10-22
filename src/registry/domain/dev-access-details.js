'use strict';

module.exports = (conf, cdn) => {
  const filePath = () => `${conf.s3.componentsDir}/dev-access.log`;
  const getFile = callback => cdn.getFile(filePath(), true, callback);
  const save = (data, callback) =>
    cdn.putFileContent(data, filePath(), true, callback);

  const log = (logMessage, callback) => {
    getFile((getFileErr, details) => {
      if (getFileErr) {
        callback(getFileErr);
        return;
      }
      const newFileContent = `${details}\n${logMessage}`;
      save(newFileContent, saveErr => {
        if (saveErr) {
          callback(saveErr);
          return;
        }
        callback(null, true);
      });
    });
  };

  return {
    log
  };
};
