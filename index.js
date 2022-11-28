const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { query } = require('express');
const app = express();
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 8000;

// middleware
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ptptzcl.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next){
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(491).send('Unauthorized Access')
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded){
        if(err){
            return res.status(403).send({message:'Unauthorised access'})
        }
        req.decoded = decoded;
        next()
    })
    // console.log('header-',token);
}


async function run(){
    try{
        const booksPostedCollection = client.db('bookSourcing').collection('bookPosts');
        const usersCollection = client.db('bookSourcing').collection('users');
        const bookingOrdersCollection = client.db('bookSourcing').collection('bookingOrders');
        



        // verify Admin
        // NOTE: must be after verifyJWT function
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = {
                email: decodedEmail
            }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access!' })
            }

            next()
        }

        // ==========================================
        // Book selling Post Management **
        // ==========================================

        // ***************** Get all Book Posts **************** //
        app.get('/bookPosts', async (req, res) => {
            
            const query = {}
            const result = await booksPostedCollection.find(query).toArray();
            res.send(result)
        })

        // ***************** Get Category Names **************** //
        app.get('/category', async(req, res)=>{
            const query = {}
            const bookPosts = await booksPostedCollection.find(query).toArray();
            const categories = [];
            bookPosts.map(bookPost=>{
                if (!categories.includes(bookPost.category)){
                    categories.push(bookPost.category)
                }
            })
            res.send(categories)
        })

        // ***************** Get Category wise Books **************** //
        app.get('/category/:name', async(req, res)=>{
            const categoryName = req.params.name;
            const filter = {
                category: categoryName
            }
            const categoryWiseBooks = await booksPostedCollection.find(filter).toArray();
            res.send(categoryWiseBooks)
        })

        // ***************** Get Category wise Books **************** //
        app.post('/bookPost', async(req, res)=>{
            const bookPost = req.body;
            const result = await booksPostedCollection.insertOne(bookPost);
            res.send(result)
        })

        
        

        
        // ==========================================
        // Users Management **
        // ==========================================
        
        //************* User data saving API ******************//
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result)
        })

        //***************/ Load Users /**************/
        app.get('/allusers', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users)
        })

        //***************/ Load Seller /**************/
        app.get('/allSellers', async (req, res) => {
            const query = {
                seller: true
            };
            const sellers = await usersCollection.find(query).toArray();
            console.log(sellers);
            res.send(sellers)
        })

        //***************/ Load Seller /**************/
        app.get('/allBuyers', async (req, res) => {
            const query = {
                seller: false
            };
            const buyers = await usersCollection.find(query).toArray();
            console.log(buyers);
            res.send(buyers)
        })

        //***************/ Load specific user /*****************/
        
        // check admin
        app.get('/allusers/admin/:email', async (req, res) => {
            const email = req.params.email;
            const filter = {
                email: email
            }
            const result = await usersCollection.findOne(filter);
            res.send({ isAdmin: result?.role === 'admin' })
        })

        // check seller
        app.get('/allusers/seller/:email', async (req, res) => {
            const email = req.params.email;
            const filter = {
                email: email
            }
            const result = await usersCollection.findOne(filter);
            res.send({ isSeller: result?.seller })
        })
        

        // make admin API update user
        app.put('/allusers/admin/:id', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const query = {
                email: decodedEmail
            }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access!' })
            }

            const id = req.params.id;
            const filter = {
                _id: ObjectId(id)
            }
            const options = {
                upsert: true
            }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result)
        })

        // ==========================================
        // Order booking Management **
        // ==========================================
        app.post('/bookingOrder', async(req, res)=>{
            const order = req.body;
            const result = await bookingOrdersCollection.insertOne(order);
            res.send(result)
        })

        app.get('/bookingOrder/:email', async(req, res)=>{
            const email = req.params.email;
            const filter = {
                buyerEmail: email
            }
            const result = await bookingOrdersCollection.find(filter).toArray();
            res.send(result)
        })

        // Get appointment options
       

    // Payment
        app.post("/create-payment-intent", async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                "payment-method-types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

    // JWT API
    app.get('/jwt', async(req, res)=>{
        const email = req.query.email;
        const query = {
            email: email
        }
        const user = await usersCollection.findOne(query);
        // console.log('step-1',user);
        if(user){
            const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '10h'})
            // console.log('step-2', token);
            return res.send({accessToken : token})
        }
        res.status(403).send({accessToken:''})
    })

    


    }
    finally{

    }
}
run()
.then(()=>{})
.catch((err) => { console.log(err) })



app.get('/', async(req, res)=>{
    res.send('BookSourcing api is Running')
})

app.listen(port, ()=>{
    console.log(`BookSourcing is running on port- ${port}`)
})



