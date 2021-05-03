import React from 'react'
import {NerdGraphQuery, nerdlet, Spinner} from 'nr1'
import workloadsConfig from './config.json'

export default class BlackhawkUpNerdlet extends React.Component {

    intervalId = 0
    maxGuidsPerApiCall = 25
    workloadToEntityOutlines = {}
    guidToEntity = {}
    entityOutlines = []

    constructor(props) {
        super(props)
        nerdlet.setConfig({timePicker : false})
    }

    componentDidMount() {
        const init = () => {
            this.workloadToEntityOutlines = {}
            this.guidToEntity = {}
            this.entityOutlines = []
            this.processWorkloads()
        }
        init()
        this.intervalId = setInterval(init, workloadsConfig.intervalDelayMs)
    }

    componentWillUnmount() {
        clearInterval(this.intervalId);
    }

    async processWorkloads() {
        const workloadsQueryString = `{
            actor {
                account(id: ${workloadsConfig.accountId}) {
                    workload {
                        collections {
                            name
                            permalink
                            entitySearchQuery
                        }
                    }
                }
            }
        }`
        let results = await NerdGraphQuery.query({ query: workloadsQueryString })
        let collections = results.data.actor.account.workload.collections
        for(let i = 0; i < collections.length; i++) {
            let collection = collections[i]
            workloadsConfig[collection.name] = collection
            await this.searchForEntities(collection)
        }
        await this.queryEntitiesByGuids(this.entityOutlines)
        for(let i = 0; i < collections.length; i++) {
            let collection = collections[i]
            this.processViolations(collection)
        }
    }

    //Entity Search returns max 49 entities hence pagination
    async searchForEntities(collection, nextCursor, prevEntityOutlines) {
        const nextCursorString = nextCursor ? `(cursor: "${nextCursor}")` : ""
        const entitySearchString = `{
            actor {
                entitySearch(query: "(alertSeverity = 'CRITICAL' OR alertSeverity = 'WARNING') AND domain IN ('APM', 'INFRA') AND ${collection.entitySearchQuery}") {
                    results${nextCursorString} {
                        entities {
                            guid
                        }
                        nextCursor
                    }
                }
            }
        }`
        //execute the entity search, but this will only give us EntityOutlines
        let results = await NerdGraphQuery.query({ query: entitySearchString })

        //with entitySearch, we could have pulled AlertableEntityOutlines but it would have been pointless
        //"outlines" being the operative word since these don't tell you the violations
        //So if we want to categorize the violations as performance, throughput, etc
        //We will have to use the guids in the results to query each entity
        //But only query entities that haven't been queried for previous workloads
        const searchResults = results.data.actor.entitySearch.results
        const currEntityOutlines = (prevEntityOutlines ? prevEntityOutlines : []).concat(searchResults.entities)
        if(searchResults.nextCursor) {
            await this.searchForEntities(collection, searchResults.nextCursor, currEntityOutlines)//recursively get the next page until nextCursor is null
        }else{
            this.workloadToEntityOutlines[collection.name] = currEntityOutlines
            this.entityOutlines = this.entityOutlines.concat(currEntityOutlines)
        }
    }

    //There's a limit to how many entities that can be requested per call so need to recursively call this method.
    async queryEntitiesByGuids(entitiesNotYetQueried, prevEntities) {
        if(entitiesNotYetQueried.length == 0) return
        const nextEntityOutlines = entitiesNotYetQueried.slice(this.maxGuidsPerApiCall)
        entitiesNotYetQueried = entitiesNotYetQueried.slice(0,this.maxGuidsPerApiCall)
        const guidArrayStr = this.buildGuidArrayStr(entitiesNotYetQueried)
        const now = Date.now()
        //this is not documented anywhere but supposedly nerdgraph will
        //return all alert violations that overlap with
        //the time window we specify using startTime and endTime
        //BUG: the API can only return 50 violations per entity and there's no pagination! No workaround!
        const entityQueryString = `{
            actor {
                entities(guids: ${guidArrayStr}) {
                    guid
                    ... on AlertableEntity {
                        alertViolations(startTime: ${now}, endTime: ${now}) {
                            closedAt
                            label
                            level
                        }
                    }
                }
            }
        }`
        let results = await NerdGraphQuery.query({ query: entityQueryString })
        const entities = results.data.actor.entities
        entities.forEach(entity => {
            this.guidToEntity[entity.guid] = entity
        })
        const currEntities = (prevEntities ? prevEntities : []).concat(entities)
        if(nextEntityOutlines.length > 0) {
            await this.queryEntitiesByGuids(nextEntityOutlines, currEntities)
        }
    }

    buildGuidArrayStr(entityOutlines) {
        var guids = "["
        entityOutlines.forEach(entityOutline => {
            guids += '"' + entityOutline.guid + '",'
        })
        guids = guids.substring(0, guids.length-1) //remove trailing comma
        guids += "]"
        return guids
    }

    //O(N*M) where N is the number of entities and M is the number of violations per entity
    //For each of the following categories: Performance, Throughput, Error Rate, Backend, Database, Host
    //Check to see if there's at least one active critical violation
    //Also check to see if there's at least one active warning violation
    //Relying on labels is brittle as the text descriptions can change. There's no other choice.
    processViolations(collection) {
        let levels = {
            performance: 1,
            throughput: 1,
            error: 1,
            backend: 1,
            database: 1,
            host: 1
        }
        let entityOutlines = this.workloadToEntityOutlines[collection.name]
        let i = 0
        for(i = 0; i < entityOutlines.length; i++) {
            let entity = this.guidToEntity[entityOutlines[i].guid]
            let j = 0
            for(j = 0; j < entity.alertViolations.length; j++) {
                let violation = entity.alertViolations[j]
                if(!violation.closedAt){
                    if(/Web response time|Background response time|Apdex/.test(violation.label)){
                        levels.performance = Math.max(levels.performance, violation.level)
                    }else if(/Web throughput|Background throughput/.test(violation.label)){
                        levels.throughput = Math.max(levels.throughput, violation.level)
                    }else if(/Error percentage/.test(violation.label)){
                        levels.error = Math.max(levels.error, violation.level)
                    }else if(/Response time|Throughput|External/.test(violation.label)){
                        levels.backend = Math.max(levels.backend, violation.level)
                    }else if(/Datastore/.test(violation.label)){
                        levels.database = Math.max(levels.database, violation.level)
                    }else if(/CPU|Load|Memory|Swap|Disk|Transmit|Receive|Read|Write|Inodes|Queue|Total/.test(violation.label)){
                        levels.host = Math.max(levels.host, violation.level)
                    }
                }
                if(this.isCompletelyCritical(levels)) break //to save time, break if all categories are already critical
            }
        }
        this.setState({ [collection.name] : levels})
    }

    isCompletelyCritical(levels){
        return (
            levels.performance === 3 &&
            levels.throughput === 3 &&
            levels.error === 3 &&
            levels.backend === 3 &&
            levels.database === 3 &&
            levels.host === 3
        )
    }

    render() {
        if(this.state && Object.keys(this.state).length > 0) {
            const workloads = Object.keys(this.state).sort()
            const alertTypes = Object.keys(this.state[workloads[0]])
            return (
                <div>
                    <div>
                        <h2>Leave No Service Behind</h2>
                    </div>
                    <table className="table-header-rotated">
                        <thead>
                            <tr>
                                <th></th>
                                {alertTypes.map(alertType => (
                                    <th className="rotate-45" key={alertType}>
                                        <div>
                                            <span>{alertType}</span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {workloads.map(workload => (
                                <tr key={workload} onClick={()=> window.open(workloadsConfig[workload].permalink)}>
                                    <th>{workload}</th>
                                    {alertTypes.map(alertType => (
                                        <td key={workload+"|"+alertType}>
                                            <span className={"circle " + this.stringifyAlertLevel(this.state[workload][alertType])}/>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
        } else {
            return <Spinner/>
        }
    }

    stringifyAlertLevel(alertLevel) {
        switch(alertLevel) {
            case 1:
                return "ok"
            case 2:
                return "warning"
            case 3:
                return "critical"
        }
    }
}
