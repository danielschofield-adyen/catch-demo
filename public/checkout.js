const clientKey = document.getElementById("clientKey").innerHTML;
const type = document.getElementById("type").innerHTML;

// Used to finalize a checkout call in case of redirect
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('sessionId'); // Unique identifier for the payment session
const redirectResult = urlParams.get('redirectResult');

async function startCheckout() {
  
  try
  {
    const paymentMethodsResponse = await callServer("/api/getPaymentMethods");
    const configuration = {
        paymentMethodsResponse: paymentMethodsResponse,
        clientKey,
        locale: "en_AU",
        environment: "test",  // change to live for production
        paymentMethodsConfiguration: {
            ideal: {
                showImage: true
            },
            card: {
                name: "Credit or debit card",
                amount: {
                    value: 10000,
                    currency: "AUD"
                },
            },
            paypal: {
                amount: {
                    currency: "AUD",
                    value: 10000
                },
                environment: "test",
                countryCode: "AUD"   // Only needed for test. This will be automatically retrieved when you are in production.
            }
        },
        onSubmit: (state, component) => {
          if (state.isValid) {
            handleSubmission(state, component, "/api/initiatePayment");
          }
        },
        onAdditionalDetails: (state, component) => {
          handleSubmission(state, component, "/api/submitAdditionalDetails");
        },
        onPaymentCompleted: (result, component) => {
            handleServerResponse(result, component);
        },
        onError: (error, component) => {
            console.error(error.name, error.message, error.stack, component);
        }
    };

    const checkout = await AdyenCheckout(configuration);
    const checkoutObj = checkout.create(type).mount(document.getElementById(type));

  } catch (error) {
    console.error(error);
    alert("Error occurred. Look at console for details");
  }
}

startCheckout();

//Event handler - handle certain events such as when the shopper clicks the Pay button, or when additional information is required to complete the payment
async function handleSubmission(state, component, url) {
  try {
    const res = await callServer(url, state.data);
    handleServerResponse(res, component);
  } catch (error) {
    console.error(error);
  }
}

// Calls your server endpoints
async function callServer(url, data) {
  const res = await fetch(url, {
    method: "POST",
    body: data ? JSON.stringify(data) : "",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return await res.json();
}

function handleServerResponse(res, component) {
  if (res.action) {
    component.handleAction(res.action);
  } else {
    switch (res.resultCode) {
      case "Authorised":
        window.location.href = "/result/success";
        break;
      case "Pending":
      case "Received":
        window.location.href = "/result/pending";
        break;
      case "Refused":
        window.location.href = "/result/failed";
        break;
      default:
        window.location.href = "/result/error";
        break;
    }
  }
}
