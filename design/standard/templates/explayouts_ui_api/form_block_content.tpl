<form method="post" action="{$action_url}" class="content-form block-form layouts-form" name="content_edit">
    <input type="hidden" name="ezxform_token" value="{$ezxform_token|wash()}" />
    <div class="row-input">
        <label for="content_edit_name">{'Block label'|i18n( 'design/standard/explayouts_ui_api/form_block_content' )}</label>
        <input type="text" id="content_edit_name" name="name" value="{$block_name|wash()}" class="form-control" />
    </div>
    {* The parameters of the group "content" (the block's text, links, images, video and map), as in the reference's
       content form; saved by the same auto-submit as the Design tab. *}
    {if is_set( $parameters )}
    {foreach $parameters as $param_name => $param}
        {include uri='design:explayouts_ui_api/form_block_parameter.tpl' param_name=$param_name param=$param value=cond( is_set( $parameter_values[$param_name] ), $parameter_values[$param_name], '' ) parameter_values=$parameter_values}
    {/foreach}
    {/if}
</form>
