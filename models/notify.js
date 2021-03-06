var config = require('../config');
var log = require('../lib/logger');
var user_model = require('./user');
if (config.twilio && config.twilio.notify_sid) {
	var twilio = require('twilio')(config.twilio.account_sid, config.twilio.auth_token);
	var service = twilio.notify.v1.services(config.twilio.notify_sid);
}

// adds a binding for a user, with the given tag
// stores binding SID as a user setting
// sets identity to user's email
// overwrites any existing binding for the user with the same endpoint
// accepts a user object and a list of tags as strings
// returns a promise that fulfills to the binding SID on success; error details on failure
function create_binding(user, tags, identity) {
	if (!identity) {
		identity = user.settings.email || user.username;
	}
	bindingType = user.type;
	bindingAddress = user.username;
	if (bindingType === 'fb') {
		bindingType = 'facebook-messenger';
		bindingAddress = bindingAddress.replace('Messenger:','');
	}

	return new Promise(function(fulfill, reject){
		service.bindings.create({
			endpoint: 'votebot-api:'+config.environment+':'+user.id,
			identity: identity,
			bindingType: bindingType,
			address: bindingAddress,
			tag: tags
		}).then(function(response) {
			log.info('notify: created binding for', user.username, 'with tags:', JSON.stringify(tags));
			// store the binding SID with the user object
			if (!user.settings) {
				user.settings = {};
			}
			user.settings.notify_binding_sid = response.sid;
			user_model.update(user.id, user);
			fulfill(response.sid);
		}).catch(function(error) {
			log.error('notify: failed to create binding: '+ user.username, error);
			reject(error);
		});
	});
};
exports.create_binding = create_binding;

// adds tags to a user's binding
// updates the binding SID for the user
// accepts a user object and a list of new tags as strings
// returns a promise that fulfills to the binding SID on success; error details on failure
exports.add_tags = function(user, new_tags) {
	return exports.replace_tags(user, [], new_tags);
}

// removes tags from a user's binding
// creates a binding with no tags if no binding exists
// accepts a user obejct and a list of tags to remove
// returns a promise that fulfills to the binding SID on success; error details on failure
exports.remove_tags = function(user, old_tags) {
	return exports.replace_tags(user, old_tags, []);
}

// fetches all tags associated with a user
// accepts a user object
// returns a promise that fulfills to array of tags; error details on failure
exports.get_tags = function(user) {
	return new Promise(function(fulfill, reject) {
		fetch_binding(user)
		.then(function(binding) {
			fulfill(binding.tags);
		}).catch(function(error) {
			reject(error);
		});
	});
}

// fetches a binding associated with a user
// accepts a user object
// returns a promise that fulfills to the user's binding or null; error details on failure
function fetch_binding(user) {
	return new Promise(function(fulfill, reject) {
		if (!user.settings || !user.settings.notify_binding_sid) {
			fulfill(null);
		} else {
			service.bindings(user.settings.notify_binding_sid).fetch()
			.then(function(response) {
				fulfill(response);
			}).catch(function(error) {
				log.error('notify: error fetching binding: '+ user.username, error);
				reject(error);
			});	
		}
	});
}

// removes old tags and adds new tags to a user's binding
// updates the binding SID for the user
// accepts a user object, list of tags to remove and a list of tags to add as strings
// returns a promise that fulfills to the new binding SID on success; error details on failure
exports.replace_tags = function(user, tags_to_remove, tags_to_add) {
	return new Promise(function(fulfill, reject) {
		fetch_binding(user)
		.then(function(binding) {
			if (binding) {
				// if binding exists, remove old tags
				tags = binding.tags.slice();
				for (tag in tags_to_remove) {
					tag_to_remove = tags_to_remove[tag];
					if ((tag_index = tags.indexOf(tag_to_remove)) > -1) {
						tags.splice(tag_index, 1);
					}
				}
			} else {
				// if no binding exists, start with empty tag list
				tags = [];
			}
			// add new tags
			for (tag in tags_to_add) {
				tag_to_add = tags_to_add[tag];
				if ((tag_index = tags.indexOf(tag_to_add)) == -1) {
					tags.push(tag_to_add);
				}
			}
			// create a new binding with updated tags
			create_binding(user, tags)
			.then(function(response_sid) {
				fulfill(response_sid);
			});
		}).catch(function(error) {
			reject(error);
		});
	});
}

exports.delete_binding = function(user) {
	return new Promise(function(fulfill, reject){
		if (!user.settings.notify_binding_sid) { return fulfill(); }
		service.bindings(user.settings.notify_binding_sid).remove()
		.then(function(response) {
			log.info('notify: deleted binding for', user.username);
			// store the binding SID with the user object
			if (!user.settings) {
				user.settings = {};
			}
			user.settings.notify_binding_sid = null;
			user_model.update(user.id, user);
			fulfill(response.sid);
		}).catch(function(error) {
			log.error('notify: failed to delete binding for user: '+ user.username, error);
			reject(error);
		});
	});
}

