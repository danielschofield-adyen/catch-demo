//const Logger = require("./Logger");
//const logger = new Logger();

// Calls your server endpoints
async function callServer(url, data) {
    //add logging for request
    //logger.log(`{Request URL: ${url}, Body: ${data}}`);
    const res = await fetch(url, {
      method: "POST",
      body: data ? JSON.stringify(data) : "",
      headers: {
        "Content-Type": "application/json",
      },
    });
    //add logging for response
    const response = await res.json();
    //logger.log(`{Response URL: ${url}, Body: ${response}}`);
    return response;
  }