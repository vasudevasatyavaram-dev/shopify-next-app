-- Enable pgcrypto for uuid generation if not already enabled
create extension if not exists "pgcrypto";
-- Create Session table
create table "Session" (
  "id" text not null primary key,
  "accessToken" text,
  "expires" timestamp(3),
  "isOnline" boolean not null,
  "scope" text,
  "shop" text not null,
  "state" text not null,
  "apiKey" text not null,
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) not null
);
-- Create OnlineAccessInfo table
create table "OnlineAccessInfo" (
  "id" text not null primary key,
  "sessionId" text unique references "Session"("id") on delete set null,
  "expiresIn" integer not null,
  "associatedUserScope" text not null,
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) not null
);
-- Create AssociatedUser table
create table "AssociatedUser" (
  "id" text not null primary key,
  "onlineAccessInfoId" text unique references "OnlineAccessInfo"("id") on delete set null,
  "userId" bigint not null,
  "firstName" text not null,
  "lastName" text not null,
  "email" text not null,
  "accountOwner" boolean not null,
  "locale" text not null,
  "collaborator" boolean not null,
  "emailVerified" boolean not null,
  "createdAt" timestamp(3) not null default CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) not null
);