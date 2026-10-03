<template>
  <article class="feature-highlight">
    <div class="feature-image">
      <img
        :src="imageSrc"
        :alt="imageAlt || title"
        loading="lazy"
        @error="handleImageError"
      />
    </div>
    <div class="feature-content">
      <h3 class="feature-title">{{ title }}</h3>
      <div class="feature-description">
        <slot></slot>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  imageSrc: string;
  imageAlt?: string;
}>();

const handleImageError = (event: Event) => {
  console.error('Failed to load image:', (event.target as HTMLImageElement).src);
};
</script>

<style scoped lang="scss">
$accent-primary: #4589ff;

.feature-highlight {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 3rem;
  align-items: center;
  padding: 3rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  &:last-child {
    border-bottom: none;
  }

  .feature-image {
    justify-self: center; // narrow (portrait) shots keep their frame around the image
    max-width: 100%;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: transform 0.3s ease, box-shadow 0.3s ease;

    &:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 50px rgba(69, 137, 255, 0.25);
    }

    img {
      width: auto;
      max-width: 100%;
      max-height: 620px;
      height: auto;
      display: block;
    }
  }

  .feature-content {
    .feature-title {
      font-size: 1.75rem;
      color: $accent-primary;
      margin: 0 0 1rem;
      font-weight: 600;
    }

    .feature-description {
      font-size: 1.0625rem;
      line-height: 1.75;
      color: rgba(255, 255, 255, 0.85);

      :deep(p) {
        margin: 0.75rem 0;
      }

      :deep(strong) {
        color: #fff;
        font-weight: 600;
      }

      :deep(ul) {
        margin: 1rem 0;
        padding-left: 1.25rem;

        li {
          margin: 0.4rem 0;
        }
      }

      :deep(kbd) {
        display: inline-block;
        padding: 0 0.4rem;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 0.85em;
        line-height: 1.6;
        color: #fff;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-bottom-width: 2px;
        border-radius: 4px;
      }
    }
  }

  // Alternate the image side
  &:nth-of-type(even) {
    grid-template-columns: 1fr 1.15fr;

    .feature-image {
      order: 2;
    }

    .feature-content {
      order: 1;
    }
  }
}

@media (max-width: 968px) {
  .feature-highlight,
  .feature-highlight:nth-of-type(even) {
    grid-template-columns: 1fr;
    gap: 1.5rem;
    padding: 2rem 0;

    .feature-image {
      order: 1;
    }

    .feature-content {
      order: 2;

      .feature-title {
        font-size: 1.5rem;
      }

      .feature-description {
        font-size: 1rem;
      }
    }
  }
}
</style>
