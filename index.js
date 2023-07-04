const express = require("express");
const path = require("path");
const hbs = require("express-handlebars");
const dotenv = require("dotenv");
const morgan = require("morgan");
const { uuid } = require("uuidv4");

const { hmacValidator } = require('@adyen/api-library');
const { Client, Config, CheckoutAPI } = require("@adyen/api-library");

// init app
const app = express();
// setup request logging
app.use(morgan("dev"));
// Parse JSON bodies
app.use(express.json());
// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));
// Serve client from build folder
app.use(express.static(path.join(__dirname, "/public")));

// enables environment variables by
// parsing the .env file and assigning it to process.env
dotenv.config({
  path: "./.env",
});

// Adyen Node.js API library boilerplate (configuration, etc.)
const config = new Config();
config.apiKey = process.env.CHECKOUT_APIKEY;
const client = new Client({ config });
client.setEnvironment("TEST");  // change to LIVE for production
const checkout = new CheckoutAPI(client);

app.engine(
  "handlebars",
  hbs.engine({
    defaultLayout: "main",
    layoutsDir: __dirname + "/views/layouts",
    helpers: require("./public/util/helpers"),
  })
);

app.set("view engine", "handlebars");

/* ################# API ENDPOINTS ###################### */

// Invoke /sessions endpoint
app.post("/api/sessions", async (req, res) => {

  try {
    // unique ref for the transaction
    const orderRef = uuid();
    // Allows for gitpod support
    const localhost = req.get('host');
    // const isHttps = req.connection.encrypted;
    const protocol = req.socket.encrypted? 'https' : 'http';
    // Ideally the data passed here should be computed based on business logic
    const response = await checkout.sessions({
      amount: { currency: "AUD", value: 10000 }, // value is 100€ in minor units
      countryCode: "AU",
      merchantAccount: process.env.MERCHANT_ACCOUNT, // required
      reference: orderRef, // required: your Payment Reference
      returnUrl: `${protocol}://${localhost}/checkout?orderRef=${orderRef}`, // set redirect URL required for some payment methods (ie iDEAL)
      shopperReference: process.env.SHOPPER_REFERENCE,
      shopperEmail: process.env.SHOPPER_EMAIL,
      recurring:{ contract:"RECURRING,ONECLICK"},
      // set lineItems required for some payment methods (ie Klarna)
      lineItems: [
        {quantity: 1, amountIncludingTax: 1000 , description: "item"}
      ] 
    });

    res.json(response);
  } catch (err) {
    console.error(`Error: ${err.message}, error code: ${err.errorCode}`);
    res.status(err.statusCode).json(err.message);
  }
});

app.post("/api/getPaymentMethods", async (req, res) => {
  try {
    const response = await checkout.paymentMethods({
      channel: "Web",
      merchantAccount: process.env.MERCHANT_ACCOUNT,
      shopperReference: process.env.SHOPPER_REFERENCE,
    });
    res.json(response);
  } catch (err) {
    console.error(`Error: ${err.message}, error code: ${err.errorCode}`);
    res.status(err.statusCode).json(err.message);
  }
});


const paymentDataStore = {};
 
app.post("/api/initiatePayment", async (req, res) => {
  try {
    // unique ref for the transaction
    const orderRef = uuid();
    // Allows for gitpod support
    const localhost = req.get('host');
    // const isHttps = req.connection.encrypted;
    const protocol = req.socket.encrypted? 'https' : 'http';

    // Ideally the data passed here should be computed based on business logic
    const response = await checkout.payments({

      amount: { currency: "AUD", value: 10000 }, // value is 100€ in minor units
      countryCode: "AU",
      merchantAccount: process.env.MERCHANT_ACCOUNT, // required
      reference: orderRef, // required: your Payment Reference
      channel: "Web", // required
      // we pass the orderRef in return URL to get paymentData during redirects
      returnUrl: `${protocol}://${localhost}/api/handleShopperRedirect?orderRef=${orderRef}`, // required for redirect flow
      browserInfo: req.body.browserInfo,
      paymentMethod: req.body.paymentMethod, // required
      shopperInteraction:"Ecommerce",
      recurringProcessingModel: "CardOnFile",
      shopperReference: process.env.SHOPPER_REFERENCE,
      shopperEmail: process.env.SHOPPER_EMAIL,
      recurring:{ contract:"RECURRING,ONECLICK"},
      storePaymentMethod:true,
      // set lineItems required for some payment methods (ie Klarna)
      lineItems: [
        {quantity: 1, amountIncludingTax: 1000 , description: "item"}
      ] 
    });
 
    const { action } = response;
 
    if (action) {
      paymentDataStore[orderRef] = action.paymentData;
    }
    res.json(response);
  } catch (err) {
    console.error(`Error: ${err.message}, error code: ${err.errorCode}`);
    res.status(err.statusCode).json(err.message);
  }
});

// handle both POST & GET requests
app.all("/api/handleShopperRedirect", async (req, res) => {
  // Create the payload for submitting payment details
  const orderRef = req.query.orderRef;
  const redirect = req.method === "GET" ? req.query : req.body;
  const details = {};
  if (redirect.redirectResult) {
    details.redirectResult = redirect.redirectResult;
  } else {
    details.MD = redirect.MD;
    details.PaRes = redirect.PaRes;
  }
 
  const payload = {
    details,
    paymentData: paymentDataStore[orderRef],
  };
 
  try {
    const response = await checkout.paymentsDetails(payload);
    // Conditionally handle different result codes for the shopper
    switch (response.resultCode) {
      case "Authorised":
        res.redirect("/result/success");
        break;
      case "Pending":
      case "Received":
        res.redirect("/result/pending");
        break;
      case "Refused":
        res.redirect("/result/failed");
        break;
      default:
        res.redirect("/result/error");
        break;
    }
  } catch (err) {
    console.error(`Error: ${err.message}, error code: ${err.errorCode}`);
    res.redirect("/result/error");
  }
});


app.post("/api/submitAdditionalDetails", async (req, res) => {
  // Create the payload for submitting payment details
  const payload = {
    details: req.body.details,
    paymentData: req.body.paymentData,
  };
 
  try {
    // Return the response back to client (for further action handling or presenting result to shopper)
    const response = await checkout.paymentsDetails(payload);
    res.json(response);
  } catch (err) {
    console.error(`Error: ${err.message}, error code: ${err.errorCode}`);
    res.status(err.statusCode).json(err.message);
  }
});


/* ################# end API ENDPOINTS ###################### */

/* ################# CLIENT SIDE ENDPOINTS ###################### */

// Index (select a demo)
app.get("/", (req, res) => res.render("index"));

// Cart (continue to checkout)
app.get("/preview", (req, res) =>
  res.render("preview", {
    type: req.query.type,
  })
);

// Checkout page (make a payment)
app.get("/checkout", (req, res) =>
  res.render("checkout", {
    type: req.query.type,
    clientKey: process.env.CLIENT_KEY,
    shopperReference:req.params.shopperReference
  })
);

// Result page
app.get("/result/:type", (req, res) =>
  res.render("result", {
    type: req.params.type,
  })
);

// Result page
app.get("/product", (req, res) =>
  res.render("product", {
    type: req.params.type,
  })
);

// Result page
app.get("/product-2", (req, res) =>
  res.render("product-2", {
    type: req.params.type,
  })
);


/* ################# end CLIENT SIDE ENDPOINTS ###################### */

/* ################# WEBHOOK ###################### */

app.post("/api/webhooks/notifications", async (req, res) => {

  // YOUR_HMAC_KEY from the Customer Area
  const hmacKey = process.env.ADYEN_HMAC_KEY;
  const validator = new hmacValidator()
  // Notification Request JSON
  const notificationRequest = req.body;
  const notificationRequestItems = notificationRequest.notificationItems

  // Handling multiple notificationRequests
  notificationRequestItems.forEach(function(notificationRequestItem) {

    const notification = notificationRequestItem.NotificationRequestItem

    // Handle the notification
    if( validator.validateHMAC(notification, hmacKey) ) {
      // Process the notification based on the eventCode
        const merchantReference = notification.merchantReference;
        const eventCode = notification.eventCode;
        console.log('merchantReference:' + merchantReference + " eventCode:" + eventCode);
      } else {
        // invalid hmac: do not send [accepted] response
        console.log("Invalid HMAC signature: " + notification);
        res.status(401).send('Invalid HMAC signature');
    }
});

  res.send('[accepted]')
});


/* ################# end WEBHOOK ###################### */

/* ################# UTILS ###################### */

function getPort() {
  return process.env.PORT || 8080;
}

/* ################# end UTILS ###################### */

// Start server
app.listen(getPort(), () => console.log(`Server started -> http://localhost:${getPort()}`));
