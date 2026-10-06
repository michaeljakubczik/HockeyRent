import { createApp } from '../api/index.js';
const app=await createApp();
app.listen(3001,'127.0.0.1',()=>console.log('HockeyRent API: http://127.0.0.1:3001'));
