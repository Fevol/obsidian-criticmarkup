<script lang="ts">
    import {createEventDispatcher} from "svelte";
    import SveltyPicker from "svelty-picker";
    const dispatch = createEventDispatcher();

    export let value: string[] | undefined;

</script>

<div class="criticmarkup-daterange-picker">
    <SveltyPicker
            pickerOnly
            isRange
            autocommit={false}
            mode="datetime"
            bind:value
            format="yyyy-mm-dd hh:ii:00"
            on:cancel={() => dispatch("close")}
            on:change={(e) => dispatch("close", e.detail)}
    />
</div>
