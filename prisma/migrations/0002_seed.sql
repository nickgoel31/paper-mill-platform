-- Seed data for Cloudflare D1 (idempotent-ish: uses fixed ids + INSERT OR IGNORE).
-- Default password for every account below: password123  (change immediately in production)

-- Users (one per role)
INSERT OR IGNORE INTO "User" ("id","name","email","passwordHash","role","isActive","updatedAt") VALUES
 ('usr_admin','Ramesh Patel (Admin)','admin@hrapapermill.com','$2a$10$NXfFek8iEAtd9JXTK52KwuxkAWmAcXwp08XPVJWGVU8gXdM808/fa','ADMIN',true,CURRENT_TIMESTAMP),
 ('usr_sales','Pooja Shah (Sales)','sales@papermill.local','$2a$10$NXfFek8iEAtd9JXTK52KwuxkAWmAcXwp08XPVJWGVU8gXdM808/fa','SALES',true,CURRENT_TIMESTAMP),
 ('usr_planner','Vikas Sharma (Planner)','planner@papermill.local','$2a$10$NXfFek8iEAtd9JXTK52KwuxkAWmAcXwp08XPVJWGVU8gXdM808/fa','PLANNER',true,CURRENT_TIMESTAMP),
 ('usr_operator','Jagdish Yadav (Operator)','operator@papermill.local','$2a$10$NXfFek8iEAtd9JXTK52KwuxkAWmAcXwp08XPVJWGVU8gXdM808/fa','OPERATOR',true,CURRENT_TIMESTAMP),
 ('usr_dispatch','Sunil Verma (Dispatch)','dispatch@papermill.local','$2a$10$NXfFek8iEAtd9JXTK52KwuxkAWmAcXwp08XPVJWGVU8gXdM808/fa','DISPATCH',true,CURRENT_TIMESTAMP);

-- Machines
INSERT OR IGNORE INTO "Machine" ("id","name","code","maxDeckleInch","minDeckleInch","minTrimInch","maxTrimInch","minGsm","maxGsm","speedMpm","isActive","updatedAt","createdById") VALUES
 ('mch_m1','Machine 1 (196")','M1',196.0,60.0,0.5,6.0,80,300,450,true,CURRENT_TIMESTAMP,'usr_admin'),
 ('mch_m2','Machine 2 (100")','M2',100.0,40.0,0.5,5.0,80,250,320,true,CURRENT_TIMESTAMP,'usr_admin');

-- Clients
INSERT OR IGNORE INTO "Client" ("id","name","code","gstin","addressLine1","addressLine2","city","state","pincode","contactPerson","phone","whatsappNumber","email","isActive","updatedAt","createdById") VALUES
 ('cli_01','Amber Corrugators Pvt Ltd','AMBER-01','24AABCA1234F1Z5','Plot 42, GIDC Industrial Estate','Phase 2, Vatva','Ahmedabad','Gujarat','382445','Kishore Dave','+91 98250 11223','919825011223','orders@amberpackaging.in',true,CURRENT_TIMESTAMP,'usr_admin'),
 ('cli_02','Shanti Box Manufacturing Co','SHANTI-02','27AABCS5678G1Z2','Gala No. 12, Jai Industrial Complex','MIDC Rabale','Navi Mumbai','Maharashtra','400701','Suresh Patil','+91 98200 44556','919820044556','purchase@shantiboxes.com',true,CURRENT_TIMESTAMP,'usr_admin'),
 ('cli_03','Apex Paper & Packaging','APEX-03','24AAACA9876E1ZT','Survey No. 108, NH 48','Near Overbridge, Chala','Vapi','Gujarat','396191','Mehul Mehta','+91 98795 33221','919879533221','orders@apexpack.co.in',true,CURRENT_TIMESTAMP,'usr_admin'),
 ('cli_04','Gujarat Paper Crafts','GUJPAP-04','24AACFG4432H1Z9','Plot 18, Sachin GIDC','Road No. 4','Surat','Gujarat','394230','Nitin Jariwala','+91 98241 88990','919824188990','nitin@gujaratpapercrafts.com',true,CURRENT_TIMESTAMP,'usr_admin'),
 ('cli_05','Surya Duplex & Kraft Converters','SURYA-05','08AABCS9912D1ZR','RIICO Industrial Area','Bhiwadi Ext.','Bhiwadi','Rajasthan','301019','Rajendra Singh','+91 94140 77889','919414077889','purchase@suryakraft.in',true,CURRENT_TIMESTAMP,'usr_admin'),
 ('cli_06','Mahaveer Packaging Industries','MAHAVIR-06','24AABCM3311A1Z0','Shed 5B, Aji GIDC Industrial Area','Ring Road','Rajkot','Gujarat','360003','Bhavin Vora','+91 98252 66778','919825266778','bhavin@mahaveerpack.in',true,CURRENT_TIMESTAMP,'usr_admin'),
 ('cli_07','Krishna Containers & Packaging','KRISHNA-07','23AABCK2299J1ZP','Sector 3, Pithampur Industrial Area','Dhar Road','Indore','Madhya Pradesh','454775','Deepak Agrawal','+91 98930 11992','919893011992','sales@krishnacontainers.com',true,CURRENT_TIMESTAMP,'usr_admin'),
 ('cli_08','Balaji Boards & Boxes','BALAJI-08','27AABCB8844C1Z4','B-14, Waluj MIDC','Station Road','Aurangabad','Maharashtra','431136','Sunil Deshmukh','+91 94222 55331','919422255331','balajiboxes@rediffmail.com',true,CURRENT_TIMESTAMP,'usr_admin');

-- Transporters
INSERT OR IGNORE INTO "Transporter" ("id","name","phone","gstin","isActive","updatedAt","createdById") VALUES
 ('trp_1','Shree Ganesh Roadlines','+91 98251 00001','24AABCS1111A1Z9',true,CURRENT_TIMESTAMP,'usr_admin'),
 ('trp_2','VRL Express Logistics','+91 98251 00002','29AABCV2222B1Z8',true,CURRENT_TIMESTAMP,'usr_admin'),
 ('trp_3','SafeX Freight Carriers','+91 98251 00003','27AABCS3333C1Z7',true,CURRENT_TIMESTAMP,'usr_admin');

-- Trucks
INSERT OR IGNORE INTO "Truck" ("id","registrationNumber","capacityKg","transporterId","isActive","updatedAt","createdById") VALUES
 ('trk_1','GJ-01-AB-1234',16000,'trp_1',true,CURRENT_TIMESTAMP,'usr_admin'),
 ('trk_2','GJ-06-GH-5678',22000,'trp_1',true,CURRENT_TIMESTAMP,'usr_admin'),
 ('trk_3','MH-04-CD-9012',25000,'trp_2',true,CURRENT_TIMESTAMP,'usr_admin'),
 ('trk_4','DL-01-EF-3456',18000,'trp_2',true,CURRENT_TIMESTAMP,'usr_admin'),
 ('trk_5','RJ-14-IJ-7890',20000,'trp_3',true,CURRENT_TIMESTAMP,'usr_admin');
