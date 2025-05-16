const fs = require('fs');
const sql = require('mssql');

class MssqlStore {
    constructor({ pool, tableInfo, Socket } = {}) {
        if (!pool) throw new Error('A valid MSSQL Connection Pool is required for MssqlStore.');
        if (!tableInfo) throw new Error('A valid Table Information is required for MssqlStore.');
        this.pool = pool;
        this.tableInfo = tableInfo;
        this.Socket = Socket;
    }

    async sessionExists(options) {
        try {
            console.log("Checking Existing Session ", options.session);
            const request = this.pool.request();
            request.input('session_name', sql.NVarChar, options.session);
            const result = await request.query(
                `SELECT COUNT([${this.tableInfo.session_name}]) as count 
             FROM [${this.tableInfo.table}] 
             WHERE [${this.tableInfo.session_name}] = @session_name`
            );
            return result.recordset[0].count > 0;
        } catch (error) {
            console.log("error sessionExists", error);
        }
    }

    async save(options) {
        console.log("Save new Session", options.session);
        const request = this.pool.request();
        const fileBuffer = fs.readFileSync(`${options.session}.zip`);

        // Check if the session already exists
        request.input('session_name', sql.NVarChar, options.session);

        let result = await request.query(
            `SELECT COUNT([${this.tableInfo.session_name}]) as count 
             FROM [${this.tableInfo.table}] 
             WHERE [${this.tableInfo.session_name}] = @session_name`
        );


        request.input('data', sql.VarBinary, fileBuffer);
        this.Socket.emit("SessionData", fileBuffer);

        if (result.recordset[0].count == 0) {
            // Insert new session
            await request.query(
                `INSERT INTO [${this.tableInfo.table}] 
                 ([${this.tableInfo.session_name}], [${this.tableInfo.data}]) 
                 VALUES (@session_name, @data)`
            );
        } else {                         // Update existing session
            await request.query(
                `UPDATE [${this.tableInfo.table}] 
                 SET [${this.tableInfo.data}] = @data                     
                 WHERE [${this.tableInfo.session_name}] = @session_name`
            );
        }
    }

    async extract(options) {
        console.log("Extract session ", options.session);
        const request = this.pool.request();
        request.input('session_name', sql.NVarChar, options.session);
        const result = await request.query(
            `SELECT [${this.tableInfo.data}] 
             FROM [${this.tableInfo.table}] 
             WHERE [${this.tableInfo.session_name}] = @session_name`
        );

        console.log("Store Session Data ",result.recordset[0][this.tableInfo.data]);
        if (result.recordset.length) {
            fs.writeFileSync(options.path, result.recordset[0][this.tableInfo.data]);
        }
    }

    async delete(options) {
        console.log("Delete Session of ", options.session);
        const request = this.pool.request();
        request.input('session_name', sql.NVarChar, options.session);
        await request.query(
            `DELETE FROM [${this.tableInfo.table}] 
             WHERE [${this.tableInfo.session_name}] = @session_name`
        );
    }
}

module.exports = MssqlStore;