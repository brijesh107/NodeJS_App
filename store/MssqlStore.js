const fs = require('fs');
const sql = require('mssql');

class MssqlStore {
    constructor({ pool, tableInfo } = {}) {
        if (!pool) throw new Error('A valid MSSQL Connection Pool is required for MssqlStore.');
        if (!tableInfo) throw new Error('A valid Table Information is required for MssqlStore.');
        this.pool = pool;
        this.tableInfo = tableInfo;
    }

    async sessionExists(options) {
        try {
            console.log("options", options);
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

        console.log("options", options);
        const request = this.pool.request();
        const fileBuffer = fs.readFileSync(`${options.session}.zip`);

        // Check if the session already exists
        request.input('session_name', sql.NVarChar, options.session_name);
        let result = await request.query(
            `SELECT COUNT([${this.tableInfo.session_name}]) as count 
             FROM [${this.tableInfo.table}] 
             WHERE [${this.tableInfo.session_name}] = @session_name`
        );

        request.input('data', sql.VarBinary, fileBuffer);

        if (result.recordset[0].count == 0) {
            // Insert new session
            await request.query(
                `INSERT INTO [${this.tableInfo.table}] 
                 ([${this.tableInfo.session_name}], [${this.tableInfo.data}]) 
                 VALUES (@session_name, @data)`
            );
        } else {
            // Update existing session
            await request.query(
                `UPDATE [${this.tableInfo.table}] 
                 SET [${this.tableInfo.data}] = @data                     
                 WHERE [${this.tableInfo.session_name}] = @session_name`
            );
        }
    }

    async extract(options) {
        const request = this.pool.request();
        request.input('session', sql.NVarChar, options.session);
        const result = await request.query(
            `SELECT [${this.tableInfo.data}] 
             FROM [${this.tableInfo.table}] 
             WHERE [${this.tableInfo.session_name}] = @session`
        );

        if (result.recordset.length) {
            fs.writeFileSync(options.path, result.recordset[0][this.tableInfo.data]);
        }
    }

    async delete(options) {
        const request = this.pool.request();
        request.input('session', sql.NVarChar, options.session);
        await request.query(
            `DELETE FROM [${this.tableInfo.table}] 
             WHERE [${this.tableInfo.session_name}] = @session`
        );
    }
}

module.exports = MssqlStore;