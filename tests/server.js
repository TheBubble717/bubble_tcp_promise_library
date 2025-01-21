import { tcp_server_class } from "../tcp_connections.js"
import { readFileSync } from 'node:fs'

async function main()
{
    var config = {
        "port":10000,
        "cert":readFileSync('tests/server.cert'),
        "key":readFileSync('tests/server.key'),
        "client":readFileSync('tests/client.cert'),
        "authkey":1234
    }
    var tcpserver = new tcp_server_class(config)
    await tcpserver.create_server()

    tcpserver.em.on('command', async function (message) {
        await message.reply(message.incommingdata)
     });

     tcpserver.em.on('newclient', async function (connection) {
        let current = "a"
        for(let i=0;i<100000;i++)
        {
            current = current+current
            try
            {
                let request = await tcpserver.request(current,connection.clid)
                console.log(request.data.length)
            }
            catch(err)
            {
                console.log(err)
            }

        }

     });


}
main()