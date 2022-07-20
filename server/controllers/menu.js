'use strict';

const { get, isEmpty, isObject } = require( 'lodash' );
const { prop, pick } = require( 'lodash/fp' );
const { createCoreController } = require('@strapi/strapi').factories;
const { ValidationError } = require( '@strapi/utils' ).errors;
const { PUBLISHED_AT_ATTRIBUTE } = require('@strapi/utils').contentTypes.constants;

const { UID_MENU, UID_MENU_ITEM } = require( '../constants' );
const { getService, parseBody } = require( '../utils' );

module.exports = createCoreController( UID_MENU, ( { strapi } ) =>  ( {
  async config( ctx ) {
    const service = getService( 'plugin' );
    const config = await service.getConfig();
    const schema = await service.getSchema();

    ctx.send( {
      config,
      schema,
    } );
  },

  async findRelations( ctx ) {
    const { targetField } = ctx.params;
    const { query } = ctx.request;
    const contentManager = strapi.plugin( 'content-manager' );
    const contentTypes = contentManager.service( 'content-types' );
    const entityManager = contentManager.service( 'entity-manager' );

    if ( ! targetField ) {
      return ctx.badRequest();
    }

    const modelDef = strapi.getModel( UID_MENU_ITEM );

    if ( ! modelDef ) {
      return ctx.notFound( 'model.notFound' );
    }

    const attribute = modelDef.attributes[ targetField ];

    if ( ! attribute || attribute.type !== 'relation' ) {
      return ctx.badRequest( 'targetField.invalid' );
    }

    const target = strapi.getModel( attribute.target );

    if ( ! target ) {
      return ctx.notFound( 'target.notFound' );
    }

    const entities = await entityManager.find( query, target.uid, [] );

    if ( ! entities ) {
      return ctx.notFound();
    }

    const modelConfig = await contentTypes.findConfiguration( modelDef );
    const field = prop( `metadatas.${targetField}.edit.mainField`, modelConfig ) || 'id';
    const pickFields = [ field, 'id', target.primaryKey, PUBLISHED_AT_ATTRIBUTE ];

    ctx.send( entities.map( pick( pickFields ) ) );
  },

  async create( ctx ) {
    const { query } = ctx.request;
    const { data, files } = parseBody( ctx );

    if ( ! isObject( data ) ) {
      throw new ValidationError( 'Missing "data" payload in the request body' );
    }

    // Validate slug availability.
    const isAvailable = await getService( 'menu' ).checkAvailability( data.slug );

    if ( ! isAvailable ) {
      const errorMessage = `The slug ${data.slug} is already taken`;
      return ctx.badRequest( errorMessage, { slug: errorMessage } );
    }

    // Find and return sanitized and transformed entity.
    const sanitizedInputData = await this.sanitizeInput( data, ctx );
    const entity = await getService( 'menu' ).create( {
      ...query,
      data: sanitizedInputData,
      files,
    } );
    const sanitizedEntity = await this.sanitizeOutput( entity, ctx );

    return this.transformResponse( sanitizedEntity );
  },

  async update( ctx ) {
    if ( isEmpty( ctx.request.body ) ) {
      throw new ValidationError( 'Request body cannot be empty' );
    }

    // Get the entity we are about to update so we can compare it to new data.
    const { id } = ctx.request.params;
    const menuToUpdate = await getService( 'menu' ).getMenu( id );

    if ( ! menuToUpdate ) {
      return ctx.notFound();
    }

    const { slug } = ctx.request.body;
    const isAvailable = await getService( 'menu' ).checkAvailability( slug, id );

    // Validate slug availability.
    if ( ! isAvailable ) {
      const errorMessage = `The slug ${slug} is already taken`;
      return ctx.badRequest( errorMessage, { slug: errorMessage } );
    }

    /**
     * @TODO - Use core service here to update menu. Then update menu items.
     */

    const menu = await getService( 'menu' ).updateMenu( id, ctx.request.body, menuToUpdate );

    ctx.send( { menu } );
  },

  async delete( ctx ) {
    const { id } = ctx.request.params;
    const menuToDelete = await getService( 'menu' ).getMenu( id );

    if ( ! menuToDelete ) {
      return ctx.notFound();
    }

    /**
     * @TODO - Use core service here to delete menu. Then delete menu items.
     */

    await getService( 'menu' ).deleteMenu( id );

    ctx.send( { ok: true } );
  },
} ) );
