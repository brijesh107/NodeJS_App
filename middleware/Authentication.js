const jwt = require("jsonwebtoken")
 const isAuthenticated = async (req, res, next) => {
    try {
        const secretKey = req.headers['x-secret-key'];
        if (secretKey) {
            //const token = authHeader.split("Bearer ")[1];
            if (secretKey === process.env.MY_SECRET_KEY) {
                // Valid authentication token
                return next();
            }
        }

        // Invalid or missing authentication token
        res.status(401).json({ error: 'Unauthorized' });
    }
    catch (error) {
        console.log("Authentication Error ", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

 const isAuthorised = async (req, res, next) => {
    try {
        const token = req.cookies.token || (req.header("Authorization") && req.header("Authorization").split("Bearer ")[1]);

        const userToken = req.headers.authorization;
        const splitUserToken = userToken.split("Bearer ")[1]
        const secretKey = req.headers['x-secret-key'];
        if (secretKey === process.env.MY_SECRET_KEY) {

            if (token === splitUserToken) {
                const { DealerId} = jwt.verify(token, process.env.MY_SECRET_KEY);
                req.sessionData = { DealerId: DealerId }
                next();
            } else {
                res.status(401).json({ message: "Token Not Verify / Please Login to Access The resources" });
            }
        }
        else {
            res.status(401).json({ message: "Unauthorized" });
        }


    } catch (error) {
        console.log("Authentication Error ", error);
        res.status(500).json({ success: false, message: error.message });
    }
};


module.exports = { isAuthenticated, isAuthorised };