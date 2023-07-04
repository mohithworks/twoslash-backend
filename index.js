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
          const noofDaysOver = noofDays > 31 ? 31 : noofDays;

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

app.post("/createStripePayment", async function (req, res, next) {
  console.log(req.headers);
  console.log(req.query);
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
    
    if(error) {
      console.log(error);
      response = {
          statusCode: 400,
          body: {"status":"400", "origin":origin, "error":error},
      }; 
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

      session = await stripe.checkout.sessions.create({
        success_url: 'https://twoslash.ai/payment-successful/',
        line_items: [
          {price: 'price_1NO2cpFeloY94rjLGen0ema5', quantity: 1},
        ],
        mode: 'payment',
        customer: customer,
      });

    } else {

      session = await stripe.checkout.sessions.create({
        success_url: 'https://twoslash.ai/payment-successful/',
        line_items: [
          {price: 'price_1NNyjvFeloY94rjLyAIENjGl', quantity: 1},
        ],
        mode: 'payment',
        customer: customer,
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
      
    res.send(response);
  
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
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
  console.log(event);
	if(event.type === 'checkout.session.completed') {
      console.log(event.data.object);
      const paymentIntent = event.data.object;
      console.log('PaymentIntent was successful!');

      const order_id = paymentIntent.id;
      const customerID = paymentIntent.customer;
      const amount = paymentIntent.amount_total;

      const customer = await stripe.customers.retrieve(customerID);
      const { email, phone, metadata } = customer;
    
      const userid = metadata.userid;

      console.log(customer);
      console.log('request is legit')
  
      var { date, totalDays } = getDate();
  
      console.log(date, totalDays)
  
      const transStartData = await supabase
      .from('users')
      .select("*")
      .eq('transEmail', email)
      .eq('transPhone', phone)
      .eq('id', userid)
  
      if(transStartData.error) { 
        console.log(transStartData.error)
      }
      if(transStartData.data.length > 0) { 
  
        console.log('Yes 1')
  
        var trial = amount == 900 ? totalDays : 0;
        var accountType = amount == 900 ? "Subscription" : "Lifetime";
        var prompts = amount == 900 ? 1000 : 0;
  
        console.log('Yes')
  
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
        const insertData = [{
          transEmail: email,
          transPhone: phone,
          payid: customerID,
          orderid: order_id,
        }]
        const { data } = await supabase
          .from('transactions')
          .insert(insertData).select()
  
        // if(error) { 
        //   res.json({ status: 'Error' })
        // }
        if(data) {
          res.json({ status: 'ok' })
        }
  
      }
  }else {
  
	  res.json({ status: 'Request invalid' })

	}
})

app.use(bodyParser.json())

app.listen(port, () => console.log(`server started on port ${port}`));

// export default app;
