---
name: node-liquibase-mongo
description: Generates Liquibase XML changeSets for MongoDB index creations, modifications, and collection setup.
---

# Liquibase MongoDB Index Manager

Use Liquibase with the MongoDB extension to manage MongoDB indexes and collection changesets declaratively.

## 1. Directory Structure

Place all changeSets under `db/changelog/`:

```text
db/
└── changelog/
    ├── db.changelog-master.xml
    └── changes/
        ├── 001-user-indexes.xml
        └── 002-order-indexes.xml
```

## 2. Configuration (`liquibase.properties`)

```properties
changeLogFile=db/changelog/db.changelog-master.xml
url=mongodb://localhost:27017/service_db
driver=liquibase.ext.mongodb.database.MongoClientDriver
```

## 3. Master Changelog (`db/changelog/db.changelog-master.xml`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
        http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd">

    <include file="changes/001-user-indexes.xml" relativeToChangelogFile="true"/>
</databaseChangeLog>
```

## 4. Mongo Index ChangeSet (`db/changelog/changes/001-user-indexes.xml`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:mongodb="http://www.liquibase.org/xml/ns/mongodb"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
        http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd
        http://www.liquibase.org/xml/ns/mongodb
        http://www.liquibase.org/xml/ns/mongodb/liquibase-mongodb-latest.xsd">

    <!-- Unique Index -->
    <changeSet id="001-create-unique-user-email-idx" author="lead-dev">
        <mongodb:createIndex collectionName="users">
            <mongodb:keys>{ "email": 1 }</mongodb:keys>
            <mongodb:options>{ "unique": true, "name": "idx_users_email_unique" }</mongodb:options>
        </mongodb:createIndex>
    </changeSet>

    <!-- Compound Index -->
    <changeSet id="002-create-compound-status-created-idx" author="lead-dev">
        <mongodb:createIndex collectionName="users">
            <mongodb:keys>{ "status": 1, "createdAt": -1 }</mongodb:keys>
            <mongodb:options>{ "name": "idx_users_status_createdAt" }</mongodb:options>
        </mongodb:createIndex>
    </changeSet>
</databaseChangeLog>
```

## 5. Execution Command
```bash
liquibase update
```
