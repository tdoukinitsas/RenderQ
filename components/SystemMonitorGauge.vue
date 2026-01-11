<template>
  <div class="gauge">
    <div class="gauge__header">
      <span class="gauge__label">{{ label }}</span>
      <span class="gauge__value">{{ Math.round(value) }}{{ unit }}</span>
    </div>
    <div class="gauge__bar">
      <div 
        class="gauge__fill" 
        :style="{ 
          width: `${Math.min(value, max)}%`,
          backgroundColor: color
        }"
      />
    </div>
    <span v-if="subtitle" class="gauge__subtitle">{{ subtitle }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  value: number;
  max: number;
  unit?: string;
  subtitle?: string;
  color: string;
}>();
</script>

<style lang="scss">
.gauge {
  background-color: $bg-tertiary;
  border-radius: $radius-md;
  padding: $spacing-03;
  
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: $spacing-02;
  }
  
  &__label {
    font-size: $font-size-xs;
    font-weight: $font-weight-medium;
    color: $text-secondary;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  &__value {
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    font-family: $font-family-mono;
  }
  
  &__bar {
    height: 6px;
    background-color: $bg-primary;
    border-radius: $radius-sm;
    overflow: hidden;
  }
  
  &__fill {
    height: 100%;
    border-radius: $radius-sm;
    transition: width $transition-base ease;
  }
  
  &__subtitle {
    display: block;
    margin-top: $spacing-02;
    font-size: $font-size-xs;
    color: $text-tertiary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
