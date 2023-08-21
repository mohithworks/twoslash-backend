//import express from 'express';

var { createClient } = require("@supabase/supabase-js");
var dateDifference = require('date-difference');
var express = require("express");
var cors = require("cors");
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

require("dotenv").config();

// Create a single supabase client for interacting with your database
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
//app.use(bodyParser.json())

const getDate = () => {

  const dateFormat = new Intl.DateTimeFormat('sv', { timeStyle: 'medium', dateStyle: 'short' });
  var date = new Date();
  
  const currentYear = date.getFullYear();
  const currentMonth = date.getMonth() + 1;
  
  date = dateFormat.format(date);

  const totalDays = new Date(currentYear, currentMonth, 0).getDate();

  return { date, totalDays };
}

app.get("/", function (req, res, next) {
  console.log(req.query);
  console.log(req.headers);
  res.send("Started");
});

app.post("/getApi", async function (req, res, next) {
  console.log(req.headers);
  var origin = 'POST';
  const user = req.query.userid;
  console.log(user);
  try{
      origin = req.headers.origin;
  }catch(e){}
  var response = false;
  var apikeys = '';
  var modelGPT = '';

  if(origin.includes('chrome-extension://')){
  
    console.log('Yes 1')

    let { data: users, error } = await supabase
    .from('users')
    .select('prompts, status, order_date, trial, account_type, trial_days_over, api_key, model')
    .eq('id', user)
    if(error) {
      console.log(error);
      response = {
          statusCode: 400,
          body: {"status":"400", "origin":origin, "error":error},
      }; 
    }
    if(users) { 
      console.log(users);
      const { prompts, status, order_date, trial, account_type, trial_days_over, api_key, model } = users[0];

      if(prompts > 0) {
        console.log('Yes 2')

        var updateData, trialVal, trialDaysOver, userPrompts;

        if(status !== null && account_type === 'Subscription') { 

          var { date } = getDate();
          
          var dateDif = dateDifference(new Date(order_date), new Date(date));
          
          const match = dateDif.match(/\d+d/);
          const noofDays = parseInt(match ? match[0].replace("d", "") : 0);
          const noofDaysOver = noofDays > 30 ? 30 : noofDays;

          if(trial_days_over !== noofDaysOver) { 
            var subVal = noofDaysOver - trial_days_over;
            var actualTrial = trial - subVal;
            trialVal = actualTrial < 0 ? 0 : actualTrial;
            trialDaysOver = noofDaysOver;
          }else {
            trialVal = trial < 0 ? 0 : trial;
            trialDaysOver = trial_days_over;
          }
          userPrompts = trialVal <= 0 ? 0 : users[0].prompts - 1;

          updateData = { prompts: userPrompts, trial: trialVal, trial_days_over: trialDaysOver }

        }else if(status !== null && account_type === 'Lifetime') {
          updateData = { prompts: users[0].prompts }
        }else {
          updateData = { prompts: users[0].prompts - 1 }
        }
        
        const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user)

        if(error) {
          response = {
              statusCode: 400,
              body: {"status":"400", "origin":origin, "error":error},
          }; 
        }
        if(data) { 
          apikeys = api_key ? api_key : process.env.OPENAPI_API_KEY;
          modelGPT = model ? model : 'gpt-3.5-turbo-0301';

          response = {
              statusCode: 200,
              body: {"status":"200", "origin":origin, "apiKey":apikeys, "model":modelGPT},
          };
        }
      }else {
        response = {
            statusCode: 400,
            body: {"status":"403", "origin":origin, "error":"You have exceeded your limit of 5 prompts. Please make payment for further use."},
        };
      }
    }
    res.send(response);
  
  }else {
    response = {
        statusCode: 400,
        body: {"status":"405", "origin":origin, "error":"Invalid origin"},
    };
    res.send(response);
  }

});


app.get('/date', async (req, res) => {
    var date = new Date();
    const timeZone = 'Asia/Kolkata';
    const format = new Intl.DateTimeFormat('sv', { timeStyle: 'medium', dateStyle: 'short' });
    date = format.format(date);
    var dateDif = dateDifference(new Date('2023-04-22 17:30:08'), new Date('2023-04-23 17:30:10'));
    const match = text.match(/\d+d/);
    const dValue = parseInt(match ? match[0].replace("d", "") : null);

    res.send(dateDif);
})

app.post('/payVerify', async (req, res) => {
	// do a validation
	const secret = process.env.RAZORPAY_SECRET;

	console.log(req.body.payload)
	console.log(req.body.payload.payment.entity.notes)

  const payload = req.body.payload.payment.entity;

  const { email, order_id, notes, amount } = payload;

  const phone = notes.phone;

	const crypto = require('crypto')

	const shasum = crypto.createHmac('sha256', secret)
	shasum.update(JSON.stringify(req.body))
	const digest = shasum.digest('hex')

	if (digest === req.headers['x-razorpay-signature']) {
		console.log('request is legit')

    var { date, totalDays } = getDate();

    console.log(date, totalDays)

    const transStartData = await supabase
    .from('users')
    .select("*")
    .eq('transEmail', email)
    .eq('transPhone', phone)
    .eq('id', notes.userid)

    if(transStartData.error) { 
      console.log(transStartData.error)
    }
    if(transStartData.data.length > 0) { 

      console.log('Yes 1')

      var trial = amount == 2000 ? totalDays : 0;
      var accountType = amount == 2000 ? "Subscription" : "Lifetime";
      var prompts = amount == 2000 ? 1000 : 20;

      console.log('Yes')

      var updateData = { 
        prompts: prompts, 
        orderid: order_id, 
        status: "Completed",
        order_date: date,
        trial: trial,
        account_type: accountType,
      }

      const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('transEmail', email)
      .eq('transPhone', phone)
      .eq('id', transStartData.data[0].id)

      if(error) { 
        console.log(error)
      }
      if(data) {
        console.log('Yes 2')
	      res.json({ status: 'ok' })
      }

    }else {
      const { id, card_id } = payload;
      const insertData = [{
        transEmail: email,
        transPhone: phone,
        payid: id,
        orderid: order_id,
        cardid: card_id,
      }]
      const { data, error } = await supabase
        .from('transactions')
        .insert(insertData).select()

      // if(error) { 
      //   res.json({ status: 'Error' })
      // }
      if(data) {
	      res.json({ status: 'ok' })
      }

    }
	} else {
  
	  res.json({ status: 'Request invalid' })

	}
})

app.post("/getPaymentStart", async function (req, res, next) {
  console.log(req.headers);
  console.log(req.query);
  const userid = req.query.userid;
  const email = req.query.email;
  const phoneno = req.query.phone;

  var origin = 'POST';
  try{
      origin = req.headers.origin;
  }catch(e){}

  if(origin == 'chrome-extension://emiglkgggbakjcnonbfkoenefgfaoklh' || origin == 'chrome-extension://nbacjbgboaiiokgccchodfjnniflflaj' || origin == 'https://pages.razorpay.com'){
  
    const updateData = {
      transEmail: email,
      transPhone: phoneno,
    }

    const { data, error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', userid)
    
    if(error) {
      console.log(error);
      response = {
          statusCode: 400,
          body: {"status":"400", "origin":origin, "error":error},
      }; 
    }
    if(data) { 
      console.log(data);
      response = {
          statusCode: 200,
          body: {"status":"200", "origin":origin, "message":"ok"},
      };
    }
      
    res.send(response);
  
  }else {
    res.send("Invalid Request");
  }

});

app.get("/getInvoice", async function (req, res, next) { 
  const invoice = await stripe.invoices.retrieve(
    req.query.invoice
  );
  var invoiceMilli = invoice.created * 1000;
  var invoiceMilliD = "2027-04-05T00:14:59.000Z";
  var invoiceDate = new Date(invoiceMilli)
  var invoiceDate2 = new Date(invoiceMilliD)

  console.log(invoiceDate);
  console.log(invoiceDate2);
  var dateDif = dateDifference(invoiceDate, invoiceDate2);

  const match = dateDif.match(/\d+d/);
  const noofDays = parseInt(match ? match[0].replace("d", "") : 0);
  // Calculate the difference in millisecond
  const datenw = new Date();
  console.log(dateDif);
  console.log(datenw);
  console.log(noofDays);
  res.send(invoice);
})

app.get("/getSub", async function (req, res, next) { 
  const subscription = await stripe.subscriptions.list({
    customer: req.query.customer,
    status: 'active',
  });
  if(subscription && subscription["data"].length === 0) { 
    res.status(404).send({
      status: 404,
      data: "No Active Subcriptions"
    });
    return;
  }
  const autoRenew = subscription["data"][0].collection_method === "send_invoice" ? false : true;
  console.log(autoRenew)
  res.status(200).send({
    status: 200,
    data: autoRenew
  });
});

app.get("/getSub2", async function (req, res, next) { 
  const subscription = await stripe.subscriptions.list({
    customer: req.query.customer,
  });
  res.send(subscription)
});

app.get("/updateSub", async function (req, res, next) { 
  const subscription = await stripe.subscriptions.update(
    req.query.subId,
    {
      billing_cycle_anchor: 'now', proration_behavior: 'none',
    }
  );
  var deleted = await stripe.invoices.finalizeInvoice(
    subscription.latest_invoice,
  );
  if(deleted.status === "open") {
    console.log("In void")
     deleted = await stripe.invoices.voidInvoice(
      subscription.latest_invoice,
    );
  }
  res.send(deleted)
});

app.get("/deleteInvoice", async function (req, res, next) { 
  var deleted = stripe.invoices.finalizeInvoice(
    req.query.invoice,
  );
  if(deleted.status === "open") {
     deleted = await stripe.invoices.voidInvoice(
      req.query.invoice,
    );
  }
  res.send(deleted)
});

app.get("/updateSubStat", async function (req, res, next) { 
  const subscription = await stripe.subscriptions.list({
    customer: req.query.customer,
  });

  if(subscription && subscription["data"].length > 1) { 
    res.status(400).send({
      status: 400,
      message: "Subscription not found"
    });
    return;
  }
  const subId = subscription["data"][0].id;
  const collectionType = req.query.type === "enable" ? "charge_automatically" : "send_invoice";
  const dayDue = req.query.type === "disable" ? { days_until_due: 30 } : {};

  await stripe.subscriptions.update(
    subId,
    {collection_method: collectionType, ...dayDue}
  )
  res.status(200).send({
    status: 200,
    message: "OK"
  });
});

app.get("/finInv", async function (req, res, next) { 
  var deleted = await stripe.invoices.finalizeInvoice(
    req.query.invoice,
  );
  res.send(deleted)
});

app.get("/createeditPayMode", async function (req, res, next) { 
  const customerId = req.query.customer;

  const subscription = await stripe.subscriptions.list({
    customer: customerId,
  });

  console.log(subscription["data"][0].id);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    success_url: process.env.STRIPE_CARD_EDIT_SUCCESS_URL,
    mode: 'setup',
    customer: customerId,
    setup_intent_data: {
      metadata: {
        subscription_id: subscription["data"][0].id,
      },
    },
  });

  var response;

  if(session) {
    const checkoutUrl = session.url;
    response = {
          statusCode: 200,
          body: {"status":200, "data": checkoutUrl},
    };
  }else {
    response = {
          statusCode: 400,
          body: {"status":400, "data": "error"},
    };
  }
  res.status(response.statusCode).send(response)
});

app.post("/createStripePayment", async function (req, res, next) {
  const userid = req.query.userid;
  const email = req.query.email;
  const phoneno = req.query.phone;
  const accountType = req.query.type;

  var origin = 'POST';
  try{
      origin = req.headers.origin;
  }catch(e){}

  //if(origin.includes('chrome-extension://') || origin == 'https://checkout.stripe.com'){
    var customer, session;

    const { data, error } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', userid)
    
    if(error || data.length === 0) {
      response = {
          statusCode: 400,
          body: {"status":"400", "origin":origin, "error":"There was an error"},
      }; 
      res.status(response.statusCode).send(response);
      return;
    }

    if(data[0].stripe_customer_id === null) {
      const stripeCustomer = await stripe.customers.create({
        email: email,
        phone: phoneno,
        metadata: {
          userid: userid,
        }
      });
      customer = stripeCustomer.id;
    } else {
      customer = data[0].stripe_customer_id;
    }

    if(accountType === 'Subscription') { 

      const subscription = await stripe.subscriptions.list({
        customer,
      });

      if(subscription && subscription["data"].length === 0) { 

        session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          success_url: process.env.STRIPE_PAY_SUCCESS_URL,
          line_items: [
            {price: process.env.STRIPE_SUBSCRIPTION_PRICE_ID, quantity: 1},
          ],
          mode: 'subscription',
          customer: customer,
          allow_promotion_codes: true,
        });

      }else {
        const invoiceId = subscription["data"][0].latest_invoice;
        const invoice = await stripe.invoices.retrieve(invoiceId);
        const invoiceStat = invoice.status;
        if(invoiceStat === "paid" || invoiceStat === "draft") {
          response = {
              statusCode: 404,
              body: {"status":"404", "origin":origin, "error":"No Open Invoices"},
          }; 
          res.status(response.statusCode).send(response);
          return;
        }
        session = {
          id: invoiceId,
          url: invoice.hosted_invoice_url,
        }
      }

    } else {

      session = await stripe.checkout.sessions.create({
        success_url: process.env.STRIPE_PAY_SUCCESS_URL,
        line_items: [
          {price: process.env.STRIPE_LIFETIME_PRICE_ID, quantity: 1},
        ],
        mode: 'payment',
        customer: customer,
        allow_promotion_codes: true,
      });

    }

    const checkoutUrl = session.url;
    
    const updateData = {
      stripe_pay_session_id: session.id,
      transEmail: email,
      transPhone: phoneno,
      stripe_customer_id: customer,
    }

    const updateDet = await supabase
    .from('users')
    .update(updateData)
    .eq('id', userid)
    
    if(updateDet.error) {
      console.log(updateDet.error);
      response = {
          statusCode: 400,
          body: {"status":"400", "origin":origin, "error":updateDet.error},
      }; 
    }
    if(updateDet.data) { 
      console.log(updateDet.data);
      response = {
          statusCode: 200,
          body: {"status":"200", "origin":origin, "data": checkoutUrl},
      };
    }
      
    res.status(response.statusCode).send(response);
  
  //}else {
  // res.send("Invalid Request");
 // }

});

const secret = process.env.STRIPE_WEBHOOK_SECRET;

app.post('/stripePayVerify', bodyParser.raw({type: '*/*'}), async (req, res) => {
	// do a validation
  const sig = req.headers['stripe-signature'];
  const body = req.body.toString()

  console.log(req.headers);
  let event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  }
  catch (err) {
    res.status(200).send(`Webhook Error: ${err.message}`);
  }
  console.log(event);
	if(event.type === 'charge.succeeded') {
      console.log(event.data.object);
      const paymentIntent = event.data.object;
      console.log('PaymentIntent was successful!');

      const order_id = paymentIntent.id;
      const customerID = paymentIntent.customer;
      const amount = paymentIntent.amount;

      const invoiceId = paymentIntent.invoice;
      var noofDays;

      if(invoiceId !== null) {
        const invoice = await stripe.invoices.retrieve(invoiceId);

        var invoiceDate = new Date(invoice.created * 1000);
        var currentDate = new Date();

        console.log(invoiceDate);
        console.log(currentDate);
        var dateDif = dateDifference(invoiceDate, currentDate);

        const match = dateDif.match(/\d+d/);
        noofDays = parseInt(match ? match[0].replace("d", "") : 0);
        console.log(noofDays);
      }

      if(noofDays > 0) {
        const cusSubscription = await stripe.subscriptions.list({
          customer: customerID,
        });
        const cusSubscriptionId = cusSubscription["data"][0].id;
        const subCollMethod = cusSubscription["data"][0].collection_method;
        const subCollMethodU = subCollMethod === "charge_automatically" ? true : false;

        const subscription = await stripe.subscriptions.update(
          cusSubscriptionId,
          {
            billing_cycle_anchor: 'now', proration_behavior: 'none',
            collection_method: "send_invoice", days_until_due: 30,
          }
        );
        
        var deleted = await stripe.invoices.finalizeInvoice(subscription.latest_invoice);
        if(deleted.status === "open") {
          console.log("In void")
          await stripe.invoices.voidInvoice(subscription.latest_invoice);
        }

        if(subCollMethodU) {
          await stripe.subscriptions.update(
            cusSubscriptionId,
            {
              collection_method: "charge_automatically"
            }
          );
        }
        console.log("deleted")
      }

      const customer = await stripe.customers.retrieve(customerID);

      const { metadata } = customer;
    
      const userid = metadata.userid;

      console.log(customer);
      console.log('request is legit')
  
      var { date } = getDate();
  
      console.log(date)

      const stripe_sub_amount = process.env.STRIPE_SUBSCRIPTION_AMOUNT * 100;

      var trial = amount == stripe_sub_amount ? 30 : 0;
      var accountType = amount == stripe_sub_amount  ? "Subscription" : "Lifetime";
      var prompts = amount == stripe_sub_amount ? 1000 : 20;

      var updateData = { 
        prompts: prompts, 
        orderid: order_id, 
        status: "Completed",
        order_date: date,
        trial: trial,
        account_type: accountType,
        trial_days_over: 0,
      }

      const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userid)

      if(error) { 
        res.status(200).json({ status: 'Error' })
      }
      if(data) {
        res.status(200).json({ status: 'ok' })
      }
  
  }else {
  
	  res.status(200).json({ status: 'Request invalid' })

	}
});

const editWebhookSecret = process.env.STRIPE_EDIT_WEBHOOK_SECRET;

app.post('/editPayMode', bodyParser.raw({type: '*/*'}), async (req, res) => {
	// do a validation
  const sig = req.headers['stripe-signature'];
  const body = req.body.toString()

  console.log(req.headers);
  let event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, editWebhookSecret);
  }
  catch (err) {
    res.status(200).send(`Webhook Error: ${err.message}`);
  }
	if(event.type === 'checkout.session.completed') { 

    const session = event.data.object;
    if(session.mode === "setup") {
      
      const setupIntentId = session.setup_intent;

      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

      console.log(setupIntent);
      const paymentMode = setupIntent.payment_method;
      const subId = setupIntent.metadata.subscription_id;

      await stripe.subscriptions.update(subId, {
        default_payment_method: paymentMode,
      });

      res.status(200).send({ message: "OK" });
    }else {
      res.status(200).json({ status: 'Error' });
    }
  }else {
	  res.status(200).json({ status: 'Request invalid' })
	}
});


app.use(bodyParser.json())

app.post('/check', async (req, res) => { 
  const order_id = req.query.order_id;
  //const checkout_id = req.body.checkout_id;
  
  const price = await stripe.checkout.sessions.listLineItems(
    order_id,
    { limit: 1 },
  );
  res.send(price.data[0].price.id);
});

app.listen(port, () => console.log(`server started on port ${port}`));

// export default app;
