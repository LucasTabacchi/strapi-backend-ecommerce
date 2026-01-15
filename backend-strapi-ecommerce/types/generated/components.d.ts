import type { Schema, Struct } from '@strapi/strapi';

export interface HomeFeature extends Struct.ComponentSchema {
  collectionName: 'components_home_features';
  info: {
    displayName: 'feature';
  };
  attributes: {
    description: Schema.Attribute.Text &
      Schema.Attribute.DefaultTo<'Env\u00EDos a todo el pa\u00EDs'>;
    icon: Schema.Attribute.Media<'images' | 'files'> &
      Schema.Attribute.Required;
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'Env\u00EDos a todo el pa\u00EDs'>;
  };
}

export interface HomeHero extends Struct.ComponentSchema {
  collectionName: 'components_home_heroes';
  info: {
    displayName: 'hero';
  };
  attributes: {
    backgroundImage: Schema.Attribute.Media<'images' | 'files'> &
      Schema.Attribute.Required;
    ctaLink: Schema.Attribute.String & Schema.Attribute.DefaultTo<'/productos'>;
    ctaText: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'Ver productos'>;
    highlightImage: Schema.Attribute.Media<'images' | 'files'>;
    subtitle: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'Sabores para elegir, recuerdos para guardar'>;
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'Eleg\u00ED tus favoritos'>;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'home.feature': HomeFeature;
      'home.hero': HomeHero;
    }
  }
}
