const S3FS = require("realtimatecommon/aws/s3-fs");
var s3fs = new S3FS(process.env.S3_FS_GUPSHUP_BUCKET_NAME);
const axios = require("axios");
const WhatsappCloudAPI = require("whatsappsupport");
const Whatsapp = new WhatsappCloudAPI({
  accessToken: process.env.WHATSAPP_AUTH_TOKEN,
  senderPhoneNumberId: process.env.PHONE_ID,
  WABA_ID: process.env.BUSINESS_ID,
});

function parseMessageBody(task) {
  let mediaId;
  let mediaExt;
  let templateName = task.name;
  let templateId;
  let headerObject = null;
  let publicMediaUrl;
  let destination = task.recipientPhone;
  var messageObjectType;

  // Build params
  const params = [];
  task.components.forEach((component) => {
    if (component.parameter) {
      component.parameter.forEach((parameter) => {
        if (parameter.type === "text" && parameter.text) {
          params.push(parameter.text);
        }
      });
    }
  });

  // Build header object

  task.components.forEach((component) => {
    if (component.type === "header") {
      headerObject = component;
    }
  });

  // Find file extension and mediaId and media type
  headerObject.parameters.forEach((parameter) => {
    //extracting mediaId
    mediaId = parameter.document.id;

    //extracting header type

    messageObjectType = parameter.type;

    //extracting file extension
    let dotIndex = parameter.fileName.lastIndexOf(".");
    if (dotIndex !== -1) {
      mediaExt = parameter.fileName.substring(dotIndex + 1);
      console.log("File extension:", mediaExt);
    }
  });

  // Retrieve media URL and download media
  Whatsapp.retrieveMediaUrl({ media_id: mediaId })
    .then((response) => {
      const mediaUrl = response.url;
      return Whatsapp.downloadMediaViaUrl({
        media_url: mediaUrl,
        media_extension: mediaExt,
      });
    })
    .then((fileName) => {
      const mediaFileName = fileName;
      const fileContent = fs.readFileSync(mediaFileName);
      const filenameWithPath = path.join(
        process.env.S3_FS_MOUNT_DIRECTORY || "/",
        `uploads/${mediaFileName}`
      );

      return s3fs.upload(filenameWithPath, fileContent);
    })
    .then((result) => {
      console.log(result);
      publicMediaUrl = result.url;
      console.log("Uploaded to S3");
      fs.unlinkSync(mediaFileName); // Remove locally stored file
    })
    .then(() => {
      // Find template id using name through mongo collection
      return GupshupTemplateMap.findOne(
        { name: templateName },
        { templateId: 1 }
      );
    })
    .then((result) => {
      if (result) {
        templateId = result.templateId;
        console.log("Template ID:", templateId);

        // Create template object
        const templateObject = {
          id: templateId,
          params: params,
        };
        // Create message object
        const messageObject = {
          type: headerObject.type,
          messageObjectType: { link: publicMediaUrl },
        };

        // Construct task data
        const gupshupTaskData = {
          apiEndpoint: "http://api.gupshup.io/sm/api/v1/template/msg",
          source,
          destination,
          templateObject,
          messageObject,
        };
        return gupshupTaskData;
      }
    })
    .catch((error) => {
      console.error("Error:", error);
    });
}

module.exports = {
  parseMessageBody,
};
