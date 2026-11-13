import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { z } from 'zod';
import { bookingSchema, cloneLayout, createVenueSchema, intervalSchema, makeTemplate, saveVenueSchema } from '@openvenue/contracts';
import { initialize, syncResources, transaction } from './database';
import { authentication, tokenHash } from './auth';

class RootModule {} Module({})(RootModule);
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), {status}); };
const bookingColumns = `b.id, b.venue_id AS "venueId", b.resource_id AS "resourceId", b.guest_name AS "guestName", b.starts_at AS start, b.ends_at AS end, b.status`;
export async function createApp(config: {databaseUrl: string; adminPassword: string; secureCookies: boolean}) {
  if (config.adminPassword.length < 16) throw new Error('ADMIN_PASSWORD must contain at least 16 characters');
  const pool = new Pool({connectionString: config.databaseUrl});
  try { await initialize(pool); } catch (error) { await pool.end(); throw error; }
  const app = await NestFactory.create(RootModule, {logger: false, bodyParser: false});
  const close = app.close.bind(app); app.close = async () => { await close(); await pool.end(); };
  const router = express.Router(), {matches, guard} = authentication(pool, config.adminPassword);
  app.use(helmet({contentSecurityPolicy: {directives: {"script-src": ["'self'"], "worker-src": ["'self'", 'blob:'], "img-src": ["'self'", 'data:', 'blob:'], "upgrade-insecure-requests": config.secureCookies ? [] : null}}}));
  app.use(express.json({limit:'1mb'})); app.use(cookieParser());
  app.use('/api', rateLimit({windowMs:60000, limit:300, standardHeaders:'draft-8', legacyHeaders:false}));
  router.use((req,res,next) => {
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin && origin !== `${req.protocol}://${req.get('host')}`) { res.status(403).json({message:'Cross-origin requests are not allowed'}); return; }
    }
    next();
  });
  const cookieOptions = {httpOnly:true, sameSite:'strict' as const, secure:config.secureCookies, path:'/api', maxAge:8*3600000};
  router.get('/health', async (_req,res) => { await pool.query('SELECT 1'); res.json({status:'ok'}); });
  router.post('/auth/login', rateLimit({windowMs:15*60000, limit:10, legacyHeaders:false}), async (req,res) => {
    const {password} = z.object({password:z.string().min(1).max(256)}).parse(req.body);
    if (!matches(password)) fail(401,'Invalid password');
    const token = randomBytes(32).toString('hex');
    await pool.query('DELETE FROM sessions WHERE expires_at<=now()');
    await pool.query("INSERT INTO sessions VALUES($1,now()+interval '8 hours')", [tokenHash(token)]);
    res.cookie('ov_session',token,cookieOptions).json({authenticated:true});
  });
  router.get('/auth/me', guard, (_req,res) => { res.json({authenticated:true}); });
  router.post('/auth/logout', async (req,res) => {
    if (typeof req.cookies?.ov_session === 'string') await pool.query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(req.cookies.ov_session)]);
    res.clearCookie('ov_session',cookieOptions).json({authenticated:false});
  });
  router.param('id', (req,_res,next,id) => { z.uuid().parse(id); next(); });
  router.get('/venues', async (_req,res) => { res.json((await pool.query('SELECT * FROM venues ORDER BY name')).rows); });
  router.post('/venues', guard, async (req,res) => {
    const body = createVenueSchema.parse(req.body);
    const venue = await transaction(pool,async client => {
      let layout = makeTemplate(body.kind);
      if (body.sourceId) {
        const source = (await client.query('SELECT * FROM venues WHERE id=$1',[body.sourceId])).rows[0];
        if (!source) fail(404,'Source venue not found');
        if (source.kind!==body.kind) fail(400,'Duplicate must use the same venue type');
        layout=cloneLayout(source.layout);
      }
      const row=(await client.query('INSERT INTO venues(id,name,kind,layout) VALUES($1,$2,$3,$4) RETURNING *',[randomUUID(),body.name,body.kind,JSON.stringify(layout)])).rows[0];
      await syncResources(client,row.id,layout); return row;
    });
    res.status(201).json(venue);
  });
  router.put('/venues/:id',guard,async(req,res)=>{
    const body=saveVenueSchema.parse(req.body);
    const venue=await transaction(pool,async client=>{
      const old=(await client.query('SELECT * FROM venues WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
      if(!old) fail(404,'Venue not found');
      if(old.revision!==body.revision) fail(409,'This layout changed elsewhere. Reload before editing.');
      const resourceKind={restaurant:'table',parking:'space',cinema:'seat'}[old.kind as 'restaurant'|'parking'|'cinema'];
      if(body.layout.floors.some(f=>f.resources.some(r=>r.kind!==resourceKind))) fail(400,'Resource type does not match this venue');
      await syncResources(client,old.id,body.layout);
      return (await client.query('UPDATE venues SET name=$2,layout=$3,revision=revision+1 WHERE id=$1 RETURNING *',[old.id,body.name,JSON.stringify(body.layout)])).rows[0];
    }); res.json(venue);
  });
  router.get('/venues/:id/shows',async(req,res)=>{res.json((await pool.query('SELECT id,title,starts_at AS start,ends_at AS end FROM shows WHERE venue_id=$1 AND ends_at>now() ORDER BY starts_at',[req.params.id])).rows);});
  router.post('/venues/:id/shows',guard,async(req,res)=>{
    const {title}=z.object({title:z.string().trim().min(1).max(100)}).parse(req.body), times=intervalSchema.parse(req.body);
    if(Date.parse(times.start)<=Date.now()) fail(400,'Show must start in the future');
    const venue=(await pool.query('SELECT kind FROM venues WHERE id=$1',[req.params.id])).rows[0];
    if(!venue) fail(404,'Venue not found'); if(venue.kind!=='cinema') fail(400,'Showtimes are only available for cinemas');
    const row=(await pool.query('INSERT INTO shows VALUES($1,$2,$3,$4,$5) RETURNING id,title,starts_at AS start,ends_at AS end',[randomUUID(),req.params.id,title,times.start,times.end])).rows[0];
    res.status(201).json(row);
  });
  router.get('/venues/:id/availability',async(req,res)=>{
    const times=intervalSchema.parse(req.query);
    const rows=await pool.query("SELECT resource_id FROM bookings WHERE venue_id=$1 AND status='confirmed' AND starts_at<$3 AND ends_at>$2",[req.params.id,times.start,times.end]);
    res.json({busy:rows.rows.map(r=>r.resource_id)});
  });
  router.post('/bookings',rateLimit({windowMs:60000,limit:30,legacyHeaders:false}),async(req,res)=>{
    const body=bookingSchema.parse(req.body);
    const booked=await transaction(pool,async client=>{
      const venue=(await client.query('SELECT kind FROM venues WHERE id=$1 FOR UPDATE',[body.venueId])).rows[0];
      if(!venue) fail(404,'Venue not found');
      let times;
      if(venue.kind==='cinema') {
        if(!body.showId) fail(400,'Choose a showtime');
        const show=(await client.query('SELECT starts_at,ends_at FROM shows WHERE id=$1 AND venue_id=$2',[body.showId,body.venueId])).rows[0];
        if(!show) fail(400,'Showtime not found'); times={start:show.starts_at.toISOString(),end:show.ends_at.toISOString()};
      } else { if(body.showId) fail(400,'Showtimes are only available for cinemas'); times=intervalSchema.parse(body); }
      if(Date.parse(times.start)<=Date.now()) fail(400,'Reservations must start in the future');
      if(!(await client.query('SELECT id FROM resources WHERE id=$1 AND venue_id=$2',[body.resourceId,body.venueId])).rowCount) fail(404,'Resource not found');
      return (await client.query(`INSERT INTO bookings AS b(id,venue_id,resource_id,guest_name,starts_at,ends_at,show_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${bookingColumns}`,[randomUUID(),body.venueId,body.resourceId,body.guestName,times.start,times.end,body.showId??null])).rows[0];
    }); res.status(201).json(booked);
  });
  router.get('/bookings',guard,async(_req,res)=>{res.json((await pool.query(`SELECT ${bookingColumns}, v.name AS "venueName",r.label AS "resourceLabel" FROM bookings b JOIN venues v ON v.id=b.venue_id JOIN resources r ON r.id=b.resource_id WHERE b.status='confirmed' ORDER BY b.starts_at LIMIT 500`)).rows);});
  router.delete('/bookings/:id',guard,async(req,res)=>{
    const result=await pool.query("UPDATE bookings SET status='cancelled' WHERE id=$1 RETURNING id",[req.params.id]);
    if(!result.rowCount) fail(404,'Reservation not found'); res.json({cancelled:true});
  });
  app.use('/api',router);
  app.use('/api',(_req:express.Request,res:express.Response)=>res.status(404).json({message:'Endpoint not found'}));
  app.use(express.static(resolve('dist/web')));
  app.use((req:express.Request,res:express.Response,next:express.NextFunction)=>{if(req.method==='GET' && req.accepts('html')) res.sendFile(resolve('dist/web/index.html')); else next();});
  const errors:ErrorRequestHandler=(error,_req,res,_next)=>{
    if(error instanceof z.ZodError) {res.status(400).json({message:error.issues.map(i=>i.message).join('; ')});return;}
    const status=error.code==='23P01'?409:error.code==='23503'?409:error.status??500;
    const message=error.code==='23P01'?'That resource was just reserved. Choose another time or place.':error.code==='23503'?'Cannot remove a resource with reservation history.':status>=500?'Something went wrong. Please try again.':error.message;
    if(status>=500) console.error('API failure',error.code??error.name);
    res.status(status).json({message});
  }; app.use(errors);
  await app.init(); return app;
}
