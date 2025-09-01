<template>
	Core App template

	<InputField />
</template>

<script setup lang="ts">
import { InputField } from "@trp/nui/components";
import { useNuiEvent } from "@trp/nui/composables";

useNuiEvent("example:event", (data) => {
	console.log("Received NUI event:", data);
});
</script>
