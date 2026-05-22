const express = require('express');

const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;



app.set('trust proxy', true);



// Serve static files

app.use(express.static(path.join(__dirname, 'public')));



// Default route - serve index.html

app.get('/', (req, res) => {
    
  res.sendFile(path.join(__dirname, 'index.html'));
    
});



// Serve all other files normally

app.use(express.static(__dirname));



app.listen(PORT, () => {
    
  console.log(`Server is running on port ${PORT}`);
    
});



