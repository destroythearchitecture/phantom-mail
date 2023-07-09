// pgp_queue
import * as openpgp from 'openpgp'
import { deflate } from 'node:zlib'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import * as path from 'node:path'

const do_deflate = promisify(deflate)

export const register = async function () {
  this.logdebug('Initializing PGP Queue');
  const config = this.config.get('pgp.yaml');
  const armoredKey = config.armoredPubKey
  this.publicKey = await openpgp.readKey({ armoredKey })
  this.dir = path.resolve(config.dir)
};

export const hook_data = function (next, connection) {
  connection.transaction.parse_body = true;
  next();
}

export const hook_queue = async function (next, connection) {
  const transaction = connection.transaction
  const emailTo = transaction.rcpt_to
  const body = connection.transaction.body.bodytext
  const from = transaction.mail_from

  const mail = {
    from: from.original,
    to: emailTo.map(to => to.original),
    subject: transaction.header.get('Subject'),
    date: transaction.header.get('Date'),
    body
  }

  const compressed = await do_deflate(JSON.stringify(mail))

  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ binary: compressed }),
    encryptionKeys: this.publicKey
  })

  await writeFile(`${path.resolve(this.dir, transaction.uuid)}.asc`, encrypted, 'utf8');

  next()
}