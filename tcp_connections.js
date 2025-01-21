import tls from "node:tls"
import crypto from "crypto"
import { EventEmitter } from "node:events"

/**
 * TCP-SERVER-Promises
 * @param {Object} config All needed configs for creating the server
 * @param {buffer} config.key TLS-Key of Server
 * @param {buffer} config.cert TLS-Cert of Server
 * @param {buffer} config.client TLS-Cert of Client
 * @param {number} config.port Port the Server should listen on
 * @param {string} config.authkey An authentication Key that is requested from the client to authenticate it for the server
 * @return {void}
 */

class tcp_server_class extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.em = null;
        this.sockets = []; //All Client-Sockets
        this.server = null;
        this.messages = [];
        this.cleanerstatus = false;
    }

    /**
    * TCP-SERVER-Creation
    * @return {void}
     */

    create_server() {
        return new Promise(async (resolve, reject) => {

            var that = this;
            const options = {
                key: that.config.key,
                cert: that.config.cert,
                resumable: false,
                rejectUnauthorized: true,
                requestCert: true,
                ca: [ that.config.client ]
            };

            that.server = tls.createServer(options, (socket) => {
                if(!socket.authorized){socket.destroy()}
                socket.bubbleinternal = {};
                socket.bubbleinternal.trusted = false;
                socket.bubbleinternal.clid = 0;
                socket.bubbleinternal.bmb = null //Big message Buffer


                socket.on('data', (jsondata) => {

                    if (jsondata.length == 16384) //The Message consists of multiple packages
                    {
                        try {
                            let jsonstringdata = jsondata.toString()
                            var requests = jsonstringstojsons(jsonstringdata)
                        }
                        catch
                        {
                            if (socket.bubbleinternal.bmb == null) {
                                socket.bubbleinternal.bmb = jsondata
                            }
                            else {
                                socket.bubbleinternal.bmb = Buffer.concat([socket.bubbleinternal.bmb, jsondata]);
                            }
                            return;
                        }
                    }
                    else {
                        try {
                            let jsonstringdata = jsondata.toString()
                            var requests = jsonstringstojsons(jsonstringdata)
                        }
                        catch {
                            try {
                                socket.bubbleinternal.bmb = Buffer.concat([socket.bubbleinternal.bmb, jsondata]);
                                let jsonstringdata = socket.bubbleinternal.bmb.toString()
                                var requests = jsonstringstojsons(jsonstringdata)
                                socket.bubbleinternal.bmb = null;
                            }
                            catch {
                                socket.bubbleinternal.bmb = null;
                                that.em.emit('errorhandling', { errorid: 6, msg: "Received data that's not JSON, ignoring incomming data from that socket!" })
                                return;
                            }
                        }
                    }

                    //Each Json-Object presents ONE Command / Response from the Server
                    requests.forEach(request => {

                        if (!socket.bubbleinternal.trusted) {
                            if (request.type == "A") {
                                if (that.config.authkey == request.auth) {
                                    socket.bubbleinternal.trusted = true;
                                    socket.bubbleinternal.clid = crypto.randomBytes(16).toString("hex")
                                    that.sockets.push(socket);
                                    let message = new messages(socket.bubbleinternal.clid, 0, "A", null, socket);
                                    message.reply("OK");
                                    that.em.emit('newclient', { "clid": socket.bubbleinternal.clid, socket: socket });
                                    return;
                                }
                                else {
                                    that.em.emit('errorhandling', { "clid": null, "errorid": 4, msg: "Client delivered wrong AUTHkey" });
                                    let message = new messages(null, null, "A", null, socket);
                                    message.reply("ERR")
                                    socket.destroy("Client delivered wrong AUTHkey");
                                    return;
                                }
                            }
                            else {
                                that.em.emit('errorhandling', { "clid": socket.bubbleinternal.clid, "errorid": 2, msg: "Request Type not found" + request.type });
                                let message = new messages(null, null, "A", null, socket);
                                message.reply("ERR")
                                socket.destroy("Unauthorized Client requested unknown type!");
                                return;
                            }
                        }

                        if (socket.bubbleinternal.trusted) {
                            //Incomming Request(Command) (server has to answer)
                            if (request.type == "C") {
                                let message = new messages(request.clid, request.msgid, "R", request.data, socket)
                                this.messages.push(message)
                                that.em.emit('command', message);
                                return;
                            }
                            //Incomming Answer(Response) of a Request
                            if (request.type == "R") {
                                let found = this.messages.filter(r => r.msgid === request.msgid)
                                if (found.length) {
                                    found[0].promisefunctions.resolve(request);
                                    found[0].status = 1;
                                }
                                else {
                                    that.em.emit('errorhandling', { errorid: 5, msg: `MessageID / ClientID not Found ${request.msgid}/${request.clid}` })
                                }
                                return;
                            }
                        }

                    });


                });

                //Connection End handling
                socket.on('end', () => {
                    if (socket.bubbleinternal.trusted == true) {
                        that.em.emit('end', { "clid": socket.bubbleinternal.clid, msg: "Clientconnection closed" });
                    }
                    else {
                        that.em.emit('end', { "clid": null, msg: "Clientconnection closed" });
                    }
                    socket.destroy();
                    //Mark Messages of the old socket for deletion!
                    {
                        const oldmessages = that.messages.filter(r=> r.clid == socket.bubbleinternal.clid && r.status == 0);
                        oldmessages.forEach(element => {
                            element.status=1;
                        });
                    }


                });

                //Connection Error handling
                socket.on('error', (err) => {
                    if (socket.bubbleinternal.trusted == true) {
                        that.em.emit('errorhandling', { "clid": socket.bubbleinternal.clid, errorid: 1, msg: "Error duing TCP-Connection with the Client: " + JSON.stringify(err) });
                    }
                    else {
                        that.em.emit('errorhandling', { "clid": null, errorid: 1, msg: "Error duing TCP-Connection with the Client: " + JSON.stringify(err) });
                    }

                    socket.destroy();
                    //Mark Messages of the old socket for deletion!
                    {
                        const oldmessages = that.messages.filter(r=> r.clid == socket.bubbleinternal.clid && r.status == 0);
                        oldmessages.forEach(element => {
                            element.status=1;
                        });
                    }
                });

            });

            that.server.listen(that.config.port, async () => {
                that.em = new EventEmitter();
                that.cleaner()
                resolve(true);
            });

        });

    }


    /**
     * Send request to Client
     * @param {string} data String of data sent to the client
     * @param {number} clid Clientid
     * @return {string} Returned message from the client
     */
    request(data, clid) {
        var that = this;
        return new Promise(async (resolve, reject) => {
            var socket = that.sockets.filter(r => r.bubbleinternal.clid == clid)
            let message = new messages(clid, crypto.randomBytes(16).toString("hex"), "C", null, socket[0]);
            that.messages.push(message)
            message.reply(data)
                .then(resolve)
                .catch(reject)
        });
    }

    async cleaner()
    {
        
        if(this.cleanerstatus == false)
        {
            var shouldexist=0
            this.cleanerstatus = true
            do
            {
                
                for (let i = this.messages.length - 1; i >= 0; i--) {
                    if (this.messages[i].status == 1) {
                        if(i%3 ==1)
                        {
                            shouldexist++
                            this.messages.push({"status":0})
                        }
                        this.messages.splice(i, 1);
                    }
                  }
                await waittime(10);
            }
            while(true)
        }

    }

}

/**
 * TCP-Client-Promises
 * @param {Object} config All needed configs for creating the server
 * @param {buffer} config.key TLS-Key of Client
 * @param {buffer} config.cert TLS-Cert of Client
 * @param {buffer} config.server TLS-Cert of Server
 * @param {string} config.host IP address of the Server
 * @param {number} config.port Port of the Server
 * @param {object} config.tcpoptions Additional TCP-Options on the TLS-Connection (f.e. tcpoptions:{checkServerIdentity: () => undefined,} incase the servercertificate is self signed
 * @param {string} config.authkey An authentication Key that is requested from the client to authenticate it for the server
 * @return {promise}
 */

class tcp_client_class extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.client = null;
        this.clid = 0;
        this.em = null;
        this.messages = [];
        this.bmb = null //Big Message Buffer
    }

    /**
    * TCP-Client-Creation
    * @return {promise}
     */
    create_client() {
        return new Promise(async (resolve, reject) => {
            var that = this;
            const options = {
                key: that.config.key,
                cert: that.config.cert,
                ca: [ that.config.server ],
                
                host: that.config.host,
                ...that.config.tcpoptions
            };

            that.client = tls.connect(that.config.port, options, async () => {
                that.em = new EventEmitter();
                let message = new messages(null, null, "A", null, that.client);
                message.reply(that.config.authkey)
            });


            that.client.on('data', (jsondata) => {

                if (jsondata.length == 16384) //The Message consists of multiple packages
                {
                    try {
                        let jsonstringdata = jsondata.toString()
                        var requests = jsonstringstojsons(jsonstringdata)
                    }
                    catch {
                        if (that.bmb == null) {
                            that.bmb = jsondata
                        }
                        else {
                            that.bmb = Buffer.concat([that.bmb, jsondata]);
                        }
                        return;
                    }

                }
                else {
                    try {
                        let jsonstringdata = jsondata.toString()
                        var requests = jsonstringstojsons(jsonstringdata)
                    }
                    catch {
                        try {
                            that.bmb = Buffer.concat([that.bmb, jsondata]);
                            let jsonstringdata = that.bmb.toString()
                            var requests = jsonstringstojsons(jsonstringdata)
                            that.bmb = null;
                        }
                        catch {
                            that.bmb = null;
                            that.em.emit('errorhandling', { errorid: 6, msg: "Received data that's not JSON, ignoring incomming data from that socket!" })
                            return;
                        }
                    }
                }


                //Each Json-Object presents ONE Command / Response from the Server
                requests.forEach(async request => {



                    if (request.type == "C") //{"clid": clientid , "msgid": messageid, "type":"C" or "R" , "data" : text}
                    {
                        let message = new messages(request.clid, request.msgid, "R", request.data, that.client)
                        that.messages.push(message)
                        that.em.emit('command', message);
                        return;
                    }
                    if (request.type == "R") //{"clid": clientid , "msgid": messageid, "type":"C" or "R" , "data" : text}
                    {
                        let found = that.messages.filter(r => r.msgid === request.msgid)
                        if (found.length) {
                            found[0].promisefunctions.resolve(request);
                            found[0].status = 1;
                        }
                        else {
                            that.em.emit('errorhandling', { errorid: 5, msg: "MessageID / ClientID not Found" + request.msgid + "/ " + request.clid })
                        }
                        return;
                    }
                    if (request.type == "A") {
                        if (request.data == "OK") {
                            that.clid = request.clid
                            resolve(true)
                            return;
                        }
                        else {
                            reject({ errorid: 4, msg: `Autentication failed!` })
                        }
                        return;
                    }

                    that.em.emit('errorhandling', { errorid: 2, msg: "Request Type not found" + request.type })

                });
            });

            that.client.on('end', () => {
                that.em.emit('end', "Serverconnection closed");
            });

            that.client.on('error', (err) => {
                //Triggered if the error occurs during connection start(that.em is only avaiable after successfull connection)
                if (that.em === null) {
                    reject("Error duing TCP-Connection with the Server")
                    return;
                }
                that.em.emit('errorhandling', { errorid: 1, msg: "Error duing TCP-Connection with the Server: " + JSON.stringify(err) });
            });
        });
    }


    /**
     * Send request to Server
     * @param {string} data String of data sent to the Server
     * @return {string} Returned message from the client
     */

    request(data) {
        var that = this
        return new Promise(async (resolve, reject) => {
            let message = new messages(that.client.clid, crypto.randomBytes(16).toString("hex"), "C", null, that.client);
            that.messages.push(message)
            message.reply(data)
                .then(resolve)
                .catch(reject)
        });
    }
}


/**
 * TCP-Messages-Promises
 * @param {number} clid Clientid
 * @param {string} msgid MessageID
 * @param {char} type Type of message("R":Response,"A":Authentication,"C":Command)
 * @param {string} incommingdata In case of an incomming message, the received information is in this variable. When sending, this needs to be set to null
 * @param {object} socket TLS-Socket to sent to (Server)
 * @return {void}
 */


class messages {
    constructor(clid, msgid, type, incommingdata, socket) {
        this.clid = clid;
        this.msgid = msgid;
        this.type = type;
        this.incommingdata = incommingdata;
        this.socket = socket;
        this.promise = null;
        this.promisefunctions = {}
        this.status = 0 //0=open, 1=closed (ready for deletion)
    }


    /**
     * Send Reply
     * @param {string} data String of data sent to the other Side
     * @return {promise} Object of message(incomming)
     */


    reply(data) {
        this.promise = new Promise(async (resolve, reject) => {
            var that = this
            that.promisefunctions.resolve = resolve;
            that.promisefunctions.reject = reject;

            if (that.type === "A" && that.clid == null) {
                that.socket.write(JSON.stringify({ "type": that.type, "auth": data }))
            }
            else {
                that.socket.write(JSON.stringify({ "msgid": that.msgid, "clid": that.clid, "type": that.type, "data": data.toString() }));
                if (that.type == "R") {
                    that.status = 1
                }
            }

            //Promises are only used when a command(request) was inititated, "R" and "A" don't send an answer/use own method 
            if (that.type == "C") {
                //If the promise isn't fullfilled after 120, it get's rejected automatically(Prevent, that await reply() or request() get's stuck)
                await waittime(120)
                this.status = 1
                reject("The Request wasn't answered in 120 seconds")
                return;
            }
            else if (that.type == "R") {
                resolve("SENT");
            }
        });
        return this.promise
    }
}




function jsonstringstojsons(jsonstring) {
    let jsonstringarray = jsonstring.split('}{')
    jsonstringarray.forEach(function (part, index, theArray) {
        if (theArray[index][0] == "{") { theArray[index] = theArray[index].substring(1) }
        if (theArray[index][theArray[index].length - 1] == "}") { theArray[index] = theArray[index].slice(0, -1) }
        theArray[index] = JSON.parse(`{${theArray[index]}}`);
    });
    return jsonstringarray;
}

function waittime(s) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, s * 1000);
    });
}



export { tcp_server_class, tcp_client_class }