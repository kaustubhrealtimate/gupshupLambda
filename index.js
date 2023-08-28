"use strict";
const { AsyncJobName } = require("realtimatecommon/common/typedefs");
var mongoose = require("mongoose");
const { createTxnForOffer } = require("./tasks/create_txn_for_offer");
const {
  createSaleCumEscrowAgreement,
} = require("./tasks/create_afs_and_escrow");
const { createEStampPmtOrder } = require("./tasks/create_estamp_pmt_order");
const { sendForEStamping } = require("./tasks/send_for_estamp");
const { sendForSigning } = require("./tasks/send_for_signing");
const { createTxnEscrowAccount } = require("./tasks/create_txn_escrow_account");
const { buildTxnCalendar } = require("./tasks/build_txn_calendar");
const { notifyEscrowDeposit } = require("./tasks/notify_escrow_deposit");
const {
  notifyRentalEscrowDeposit,
} = require("./tasks/notify_rental_escrow_deposit");
const { createRentalAgreement } = require("./tasks/create_rental_agmt");
const { createAFSForMoUTxn } = require("./tasks/create_afs_for_mou");
const { requestRentalFeedback } = require("./tasks/request_rental_feedback");
const {
  createRentalDepositInvoice,
} = require("./tasks/create_rental_dep_invoice");
const {
  createRentalEscrowStatement,
} = require("./tasks/create_rental_escrow_stmt");
const MessageQueue = require("realtimatecommon/aws/message-queue");
const {
  createRentalEscrowAccount,
} = require("./tasks/create_rental_escrow_account");
const whatsappTaskQueue = new MessageQueue(process.env.WHATSAPP_TASK_QUEUE_URL);
const offlineTaskQueue = new MessageQueue(process.env.OFFLINE_TASK_QUEUE_URL);
const { sendDepositInvoice } = require("./tasks/send_deposit_invoice");
const {
  sendNewServiceRequestResponse,
} = require("./tasks/service_request_response");
const { sendVideoKycLink } = require("./tasks/send_video_kyc_link");
const { deleteFileFromS3 } = require("./tasks/delete_file_from_S3");

mongoose.set("sanitizeProjection", true);
const mongoosePromise = mongoose.connect(
  process.env.MONGODB ||
    "mongodb+srv://RealtimateDev:uEVLIPhHZzcuAftV@realtimatedev.rylvo.mongodb.net/RealtimateDev?retryWrites=true&w=majority"
);

async function sendErrorMessage(recipientPhone, message, taskName = "Unknown") {
  console.log("Sending Error: ", message);
  try {
    const environment =
      process.env.PRODUCTION == 1
        ? "production"
        : process.env.UAT == 1
        ? "uat"
        : "development";
    if (environment != "development") {
      const template = {
        name: "lambda_error",
        language: { code: "en_US" },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: "text",
                text: "OfflineTask",
              },
            ],
          },
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: "OfflineTask",
              },
              {
                type: "text",
                text: taskName,
              },
              {
                type: "text",
                text: message,
              },
            ],
          },
        ],
      };
      const messageObject = {
        template,
        recipientPhone,
      };
      let result = await whatsappTaskQueue.submit(null, {
        task: "sendTemplatedMessage",
        messageObject,
      });
    }
  } catch (error) {
    console.error(error);
  }
}

exports.handler = async (event) => {
  try {
    // Get the Mongoose Client by calling await on the promise.
    // Because this is a promise, it will only resolve once.
    var mongooseClient = await mongoosePromise;
    console.log("Connected to database.");

    for (let i = 0; i < event.Records.length; i++) {
      const record = event.Records[i];
      var task;
      try {
        task = JSON.parse(record.body);
        console.log(task);
        // Perform Offline Tasks
        switch (task.name) {
          case AsyncJobName.CREATE_TXN_FOR_OFFER:
            await createTxnForOffer(task);
            break;
          case AsyncJobName.CREATE_AGMT_FOR_SALE:
          case AsyncJobName.CREATE_MOU_FOR_SALE:
            await createSaleCumEscrowAgreement(task);
            break;
          case AsyncJobName.CREATE_ESTAMP_PMT_ORDER:
            ß;
            await createEStampPmtOrder(task);
            break;
          case AsyncJobName.SEND_FOR_ESTAMP:
            await sendForEStamping(task);
            break;
          case AsyncJobName.SEND_FOR_SIGNING:
            await sendForSigning(task);
            break;
          case AsyncJobName.CREATE_ESCROW_ACCOUNT:
            await createTxnEscrowAccount(task);
            break;
          case AsyncJobName.CREATE_RENTAL_ESCROW_ACCOUNT:
            await createRentalEscrowAccount(task);
            break;
          case AsyncJobName.CREATE_TXN_CALENDAR:
          case AsyncJobName.UPDATE_TXN_CALENDAR:
            await buildTxnCalendar(task);
            break;
          case AsyncJobName.NOTIFY_RENTAL_ESCROW_DEPOSIT:
            await notifyRentalEscrowDeposit(task);
            break;
          case AsyncJobName.NOTIFY_ESCROW_DEPOSIT:
            await notifyEscrowDeposit(task);
            break;
          case AsyncJobName.CREATE_RENTAL_AGMT:
            await createRentalAgreement(task);
            break;
          case AsyncJobName.SEND_DEPOSIT_INVOICE:
            await sendDepositInvoice(task);
            break;
          case AsyncJobName.NEW_SERVICE_REQUEST_RESPONSE:
            await sendNewServiceRequestResponse(task);
            break;
          case AsyncJobName.SEND_VIDEO_KYC_LINK:
            await sendVideoKycLink(task);
            break;
          case AsyncJobName.CREATE_AFS_FOR_MOU_TXN:
            await createAFSForMoUTxn(task);
            break;
          case AsyncJobName.REQUEST_RENTAL_FEEDBACK:
            await requestRentalFeedback(task);
            break;
          case AsyncJobName.CREATE_RENTAL_DEPOSIT_INVOICE:
            await createRentalDepositInvoice(task);
            break;
          case AsyncJobName.CREATE_RENTAL_ESCROW_STMT:
            await createRentalEscrowStatement(task);
            break;
          case AsyncJobName.DELETE_FILE_FROM_S3:
            await deleteFileFromS3(task);
            break;
          default:
            throw new Error("Unknown task: " + JSON.stringify(task));
        }
      } catch (error) {
        console.error(error);
        console.error("Failed Task: ", record);
        await sendErrorMessage("917760571530", error.message, task?.name);

        // Reference: https://www.serverless.com/blog/aws-lambda-sqs-serverless-integration
        if (record.ReceiptHandle) {
          // Delete this message from the Queue
          await offlineTaskQueue.deleteMessage(record.ReceiptHandle);
          // TODO: Insert this into Dead Letter Queue
        }
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify("Completed all offline tasks!"),
    };
  } catch (error) {
    console.error(error);
    console.error("Failed OfflineTask");
    return { statusCode: 500, body: JSON.stringify(error) };
  }
};

// this.handler({ Records: [{ body: "{\"name\": \"createRentalAgm\",\"argument1\": \"632c3654e79e103385eb116f\"}" }] });

// this.handler({
//   Records: [
//     {
//       body: JSON.stringify({
//         name: 'createTxnForOffer',
//         argument1: '63a5e8c93d14d61c2dea0cfa',
//       }),
//     },
//   ],
// });

// this.handler({
//   Records: [
//     {
//       body: JSON.stringify({
//         name: 'createAgmForSale',
//         argument1: '63a5ee1d46961b15bf90094e',
//       }),
//     },
//   ],
// });

// this.handler({
//   Records: [
//     {
//       body: JSON.stringify({
//         name: 'createMouForSale',
//         argument1: '63a5ee1d46961b15bf90094e',
//       }),
//     },
//   ],
// });

// this.handler({
//   Records: [
//     {
//       body: JSON.stringify({
//         name: 'createEStampPmtOrder',
//         rental: true,
//         argument1: '6433032ba066175fd12be36c',
//         docType: 'rentalagm',
//         payerId: '622cbc5dccabaf82453fb084',
//       }),
//     },
//   ],
// });

// this.handler({
//   Records: [
//     {
//       body: JSON.stringify({
//         name: 'sendForEStamp',
//         argument1: '6328a72215aff9ecfd901076',
//         argument2: '6368c1c3f1ede043e221fca2',
//       }),
//     },
//   ],
// });

// this.handler({
//   Records: [
//     {
//       body: JSON.stringify({
//         name: 'sendForSign',
//         rental: false,
//         argument1: '62ac11c79158ae5532d5ab29',
//         argument2: '62ac11c99158ae5532d5ab3b',
//       }),
//     },
//   ],
// });

// this.handler({
//   Records: [
//     {
//       body: JSON.stringify({ name: 'createRentalAgm', argument1: '643bf415f4d622b741f53e12' }),
//     },
//   ],
// });

// this.handler({
//   Records: [
//     {
//       body: JSON.stringify({
//         name: 'reqRentalFeedback',
//         argument1: '635ead065e6f27c82c52c3e1',
//         argument2: '635ebc5b05fa5003546c9901',
//       }),
//     },
//   ],
// });

// this.handler({
//   Records: [
//     {
//       body: JSON.stringify({
//         name: 'createRentalDepInvoice',
//         argument1: '6308aafca41e5277a59c5b40',
//         payerId: '622c3477834c206a56d4ca38',
//         txnType: 'rental'
//       }),
//     },
//   ],
// });

// this.handler({
//   Records: [
//     {
//       body: JSON.stringify({
//         name: 'sendInvoiceForDeposit',
//         argument1: '64dde96c225843d5a28ae3aa',
//         argument2: '64dde9abfcbedde15f05d157',
//         argument3: 10000,
//         txnType: 'draftRental',
//       }),
//     },
//   ],
// });

// this.handler({
//   Records: [
//     {
//       body: JSON.stringify({
//         name: 'createRentalEscrowStmt',
//         argument1: 'RLTA222881157160',
//         recipientPhone: '919315553906',
//       }),
//     },
//   ],
// });

// this.handler({
//   Records: [
//     {
//       body: JSON.stringify({
//         name: 'deleteFileFromS3',
//         argument1: 'documents/invoice/depositInvoice/6308aafca41e5277a59c5b40-712bfc2b.pdf',
//       }),
//     },
//   ],
// });

if (process.env.DEVELOPMENT == 1 && process.env.OFFLINE_TASK_QUEUE_URL) {
  offlineTaskQueue
    .receiveMessage(1)
    .then((item) => {
      if (item.Messages && item.Messages.length > 0) {
        this.handler({ Records: [{ body: item.Messages[0].Body }] }).then(
          (result) => {
            console.log("Lambda Handler returned: ", result);
            if (result.statusCode == 200) {
              // Delete message from the Queue
              offlineTaskQueue
                .deleteMessage(item.Messages[0].ReceiptHandle)
                .then((result) => {
                  console.log("Successfully deleted message from Queue");
                })
                .catch((error) => {
                  console.error(error);
                  console.error("Failed to delete message from the queue");
                });
            }
          }
        );
      }
    })
    .catch((error) => {
      console.error(error);
    });
}
