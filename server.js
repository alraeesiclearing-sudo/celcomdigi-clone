const express = require('express');

const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;



app.set('trust proxy', true);



// Serve all static files from the root directory

app.use(express.static(path.join(__dirname)));



// Handle all requests - serve the requested file if it exists, otherwise serve index.html

app.get('*', (req, res) => {
    
  const filePath = path.join(__dirname, req.path);
    

    
  // Try to serve the requested file
    
  res.sendFile(filePath, (err) => {
      
    // If file not found, serve index.html for SPA routing
      
    if (err) {
        
      res.sendFile(path.join(__dirname, 'index.html'));
        
    }
      
  });
    
});



app.listen(PORT, () => {
    
  console.log(`Server is running on port ${PORT}`);
    
});











