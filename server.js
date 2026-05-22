const express = require('express');

const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;



app.set('trust proxy', true);



// Serve all static files from the root directory

app.use(express.static(path.join(__dirname)));



// No protection, no redirects - just serve files

app.listen(PORT, () => {
    
    console.log(`Server is running on port ${PORT}`);
    
});

