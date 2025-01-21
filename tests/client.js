import { tcp_client_class } from "../tcp_connections.js"
import { readFileSync } from 'node:fs'

async function client()
{
    var config = {
        authkey: "1234",
        "cert":readFileSync('tests/client.cert'),
        "key":readFileSync('tests/client.key'),
        "server":readFileSync('tests/server.cert'),
        host: "127.0.0.1",
        port:10000,
        tcpoptions:{
            checkServerIdentity: () => undefined,
        }
    }
    var tcpclient = new tcp_client_class(config)
    await tcpclient.create_client()
    
    tcpclient.em.on('command', async function (message) {

        await message.reply(message.incommingdata)
        console.log(message.incommingdata.length)
    });

    tcpclient.em.on('end', async function (data) {
        console.log(data)
    });

    tcpclient.em.on('errorhandling', async function (data) {
        console.log(`Data:${data.msg}, ErrorID:${data.errorid}`)
    });

}
client()