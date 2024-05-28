const express = require('express');
const app = express();	// app為express的應用實例
const bodyParser = require('body-parser');
app.use(bodyParser.json());//用來解析req的body
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');// 設置允許的來源
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');// 設置允許的請求方法
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');// 設置允許的請求標頭
  res.setHeader('Access-Control-Allow-Credentials', 'true');// 允許跨域請求攜帶認證資訊（如 cookie）
  next();// 繼續處理下一個中介軟體或路由處理函式
});

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = "mongodb://127.0.0.1:27017";//localhost會出錯
const client = new MongoClient(uri);
let database;
let coll;

async function connectDatabase() {
  try {
    await client.connect();
    database = client.db("IOT");
    coll = database.collection("ITI");//Infrared Thermal Imaging
    console.log("Connected to the database");
  } catch (error) {
    console.error("Error connecting to the database:", error);
  }
}

connectDatabase();//只建立一次連接並不斷開 而非每次都重新連

app.get('/',function(req,res){//http://localhost:3406/會看到的資料
  res.status(200).send('JS server is running');
})

app.post('/api/iti/',function(req,res){//新增 完成
  const sensingData = req.body; //從request中獲取新增的文件
  const temperature = sensingData.temperature;
  const timestamp = new Date();//ISO格式

  async function run() {
      try {
        const result = await coll.insertOne({temperature: temperature,date: timestamp}); //插入文檔並獲取結果
        res.status(200).send(result); //發送結果給客戶端
        //console.log(result);
      } 
      catch (error) {
        console.error("Error inserting data:", error);
        res.status(500).send('Error inserting data');
        console.log(error);
      }
  }
  run(); //執行異步函數
})

app.delete('/', function(req, res) {
  async function run() {
    try {
      const result = await coll.deleteMany({}); // 刪除集合中的所有文檔
      res.status(200).json({ message: '所有文檔已成功刪除' });
    } catch (error) {
      console.error("Error deleting data:", error);
      res.status(500).json({ error: '無法刪除文檔' });
    }
  }
  run(); // 執行異步函數
});

app.get('/api/iti/', function(req, res) {
  const startDate = new Date(req.query.start);
  const endDate = new Date(req.query.end);
  
  if (isNaN(startDate) || isNaN(endDate)) {// 檢查日期範圍的有效性
    res.status(400).send('Invalid date format');
    return;
  }

  const query = {// 構建查詢條件
    date: {
      $gte: startDate,
      $lte: endDate
    }
  };

  async function run() {
    try {
      const result = await coll.find(query,{}).toArray(); // 執行查詢並獲取結果
      const data = result.map(item => ({
        temperature: item.temperature,
        time: item.date
      }));
      res.json(data); // 回傳查詢結果
    } catch (error) {
      console.error('Error retrieving data:', error);
      res.status(500).send('Error retrieving data');
    }
  }
  run(); // 執行異步函數
});

app.get('/api/iti/new', function(req, res) {
  async function run() {
    try {
      const result = await coll.find().sort({ date: -1 }).limit(1).toArray(); // 查詢並按日期排序，只取最新的一筆
      if (result.length === 0) {
        res.status(404).send('No data found');
        return;
      }
      const latestData = {
        temperature: result[0].temperature,
        time: result[0].date
      };
      res.json(latestData); // 回傳最新的結果
    } catch (error) {
      console.error('Error retrieving data:', error);
      res.status(500).send('Error retrieving data');
    }
  }
  run(); // 執行異步函數
});

app.listen('3406',function(){
  console.log('IOT Server Running...')//顯示在下面視窗
})