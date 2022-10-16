// Include external modules
// Why const for axios?
var chalk = require('chalk');
const axios = require('axios');
var path = require('path');

// Path to config file
const config_path = __dirname+'/../../config/.env'

// ??
require('dotenv').config({path: config_path})
const { ObjectID } = require('mongodb');

// fs enables interacting with the file system
// The first line makes sure that the function works the "modern" way.
'use strict';
const fs = require('fs');

// Arrow function expression (more compact than traditional) that returns URL to collection/document
// Where is the 'process' coming from?
const generateRequest = (collection, id, version, endpoint='crud') => {

    var url = `${process.env.API_URL}:${process.env.PORT}/${endpoint}/${collection}`

    if (id) {
        if (version) return url + `/${id}/${version}`
        return url + `/${id}`
    }
    else return url
}

// This simply creates a timeout of 5 seconds (why?)
async function wait(ms = 5000) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

// This parses lines in JSON files, I guess?
function parseDocument(line) {

    let document = JSON.parse(line)

    return document
  }

// Long function that runs the whole thing
const run = async () => {

    // Batch 1M
    var fileList = [
        // path.join(__dirname, 'data', 'employee.json'),
        // path.join(__dirname, 'data', 'employee_1000.json')
        path.join(__dirname, 'data', 'employee_10000.json')
        // path.join(__dirname, 'data', 'batch_100K', 'employee_10000.json')
    ]

    // Determine collection and batch size
    const COLLECTION = 'employee'
    const BATCH_SIZE = 1000

    let total_documents = []

    // That effectively reads the JSON file
    for (var file of fileList) {
        //read the docs
        console.log(chalk.cyan.bold(" * Reading file: " + file))

        const readline = require('readline');

        const fileStream = fs.createReadStream(file);

        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        // Note: we use the crlfDelay option to recognize all instances of CR LF
        // ('\r\n') in input.txt as a single line break.

        for await (const line of rl) {
            // Each line in input.txt will be successively available here as `line`.
            let document = parseDocument(line);
            //console.log(`Doc from file: ${JSON.stringify(document)}`);
            total_documents.push(document)
        }
    }

    // Print to console the number of documents read
    console.log(chalk.cyan.bold("\n =>  Read " + total_documents.length + " total documents\n"));


    // divide all docs in batches
    let batches = []
    for (let i = 0; i < total_documents.length; i += BATCH_SIZE) {
        const chunk = total_documents.slice(i, i + BATCH_SIZE);
        batches.push(chunk)
    }

    // Record the start time
    const start_ts = process.hrtime();

    let batch_num = 1

    // Loop over individual documents in batch
    for(let documents of batches) {

        console.log(chalk.magenta.bold(" * Batch " + batch_num + "/"+ batches.length +" (" + documents.length +  " documents)"));

        var inserted = []

        // insert them
        var collection = COLLECTION 
        console.log("\t - Inserting at Collection '" + collection + "'");
        var url = generateRequest(collection)
        for(var document of documents) {
            try {
                // only for documents with dates or ids (fix for mongoose)
                Object.keys(document).forEach(function(key) {
                    var value = document[key]
                    var tags = ["$oid", "$date"]
                    tags.forEach( tag => {
                        if ((!!value) && (value.constructor === Object) 
                                      && (value.hasOwnProperty(tag))) {
                            document[key] = value[tag]
                        }
                    })
                }); 
                // ensure unique email
                if (document.email) {
                    document.email = document.email.split('@')[0] + document.custno + '@' + document.email.split('@')[1]
                }
                // post the insert
                var response = await axios.post(url, document);     
                inserted.push(response.data) 
                // break
            } catch (error) {
                console.error(chalk.redBright.bold(error.message));
                return
            }           
        }
        // Is the whitespace ok?
        // await wait()

       // Updating collections
       console.log("\t - Updating at Collection '" + collection + "'");
       for(var document of inserted) {
           await wait(100)
           try {
               // TODO for other types of documents
               var updated_document = { name: 'New '+ document.name }
               let id = document._id._id || document._id
               url = generateRequest(collection, id, 1)
               var response = await axios.patch(url, updated_document);
           } catch (error) {
               console.error(chalk.redBright.bold(error.message));
               console.error(chalk.red(error));
               return
           }
       }

        // await wait()

       // Querying
       console.log("\t - Querying currently valid version at Collection '" + collection + "'");
       for(var document of inserted) {
           try {
               let id = document._id._id || document._id
               url = generateRequest(collection, id)
               var response = await axios.get(url);
           } catch (error) {
               console.error(chalk.redBright.bold(error.message));
               return
           }
       }

       // await wait()

       // Querying
       console.log("\t - Querying past valid version at Collection '" + collection + "'");
       for(var document of inserted) {
           try {
               if (document._validity) {
                   var date = document._validity.start
                   let id = document._id._id || document._id
                   url = generateRequest(collection, id)
                   var response = await axios.get(url, {params: {date}});
               }
           } catch (error) {
               console.error(chalk.redBright.bold(error.message));
               return
           }
       }

       // await wait()

       // Querying
       console.log("\t - Querying current version at Collection '" + collection + "'");
       for(var document of inserted) {
           try {
               let id = document._id._id || document._id
               url = generateRequest(collection, id)
               var response = await axios.get(url + "/2");
           } catch (error) {
               console.error(chalk.redBright.bold(error.message));
               return
           }
       }

       // await wait()

       // Querying
       console.log("\t - Querying previous version at Collection '" + collection + "'");
       for(var document of inserted) {
           try {
               let id = document._id._id || document._id
               url = generateRequest(collection, id)
               var response = await axios.get(url + "/1");
           } catch (error) {
               console.error(chalk.redBright.bold(error.message));
               return
           }
       }

       // await wait()

       // Querying
       console.log("\t - Find by non indexed field at current collection '" + collection + "'");
       for(var document of inserted) {
           try {
               url = generateRequest(collection, 'find', undefined, endpoint='query')
               url += `?query="_validity.end": null,"pricePerWorkingUnit": {"$lte": ${document.pricePerWorkingUnit}}`
               var response = await axios.get(url);
           } catch (error) {
               console.error(chalk.redBright.bold(error.message));
               return
           }
       }

       // await wait()

       // Delete documents
       console.log("\t - Deleting from Collection '" + collection + "'");
       for(var document of inserted) {
           try {
               let id = document._id._id || document._id
               url = generateRequest(collection, id)
               var response = await axios.delete(url + '/2');
           } catch (error) {
               console.error(chalk.redBright.bold(error.message));
               return
           }
       }
       batch_num += 1
    }

    // TODO: drop collections

    // we want to record how much time this all takes
    const diff_time = process.hrtime(start_ts);

    // print to console
    console.log("Run time: " + diff_time);

}


run()